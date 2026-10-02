-- =============================================================================
-- MSC Mentorship: database migration 001 (public.mentorship_*)
-- =============================================================================
-- WHAT IT DOES
--   Creates the new mentorship system described in /mentorship/SPEC.md §3 to §6:
--   13 tables (all deny-all for anon and authenticated, RLS on, no policies), the
--   SECURITY DEFINER RPCs the pages call, the staff red-flag and payout views, two
--   storage buckets with their policies, the config seed, and AFTER triggers that
--   queue mails into the msc-mail outbox (public.mail_enqueue) only when msc-mail
--   is installed. It touches no existing table: the old portal tables
--   (mentor_profiles, mentorship_requests, mentorship_relationships, ...) are left alone.
--
-- HOW TO APPLY (Supabase SQL editor, as postgres)
--   1. Optional, for mail: apply msc-mail supabase/APPLY-ALL.sql first. Without it the
--      mail triggers are silent no-ops, and they start queueing once it exists.
--   2. Run this whole file. It is one transaction and safe to re-run.
--   3. Run the private quiz seed, mentorship_quiz_seed.local.sql (gitignored; never commit it).
--   4. Add the first admin by hand (README.md), then manage staff from /mentorship/admin/.
--
-- ROLLBACK
--   001_mentorship_down.sql drops everything this file creates. The storage buckets
--   (and any uploaded files) are kept; it prints how to remove them by hand.
--
-- VERIFY
--   verify.sql is read-only and prints one row per check; every row should say ok.
--
-- This file is public-safe: Cloudflare Pages serves every repo file, so it contains
-- no secrets and no quiz answers (those live only in the gitignored seed).
-- =============================================================================

begin;
set local lock_timeout = '3s';

-- -----------------------------------------------------------------------------
-- 1. Vocabulary and small helpers (no table access)
--    Keys mirror the constants in /mentorship/assets/mentorship-core.js exactly.
-- -----------------------------------------------------------------------------

create or replace function public.mentorship_vocab(p_name text)
returns text[]
language sql immutable
set search_path = public, pg_temp
as $$
  select case p_name
    when 'programs' then array['industrial-training', 'articleship', 'ca-fresher']
    when 'stages' then array['final_in_it', 'final_it_done', 'final_articleship_done', 'in_articleship',
                             'qualified_fresher', 'qualified_experienced']
    when 'qualified_stages' then array['qualified_fresher', 'qualified_experienced']
    when 'final_stages' then array['final_in_it', 'final_it_done', 'final_articleship_done']
    when 'tiers' then array['peer_mentor', 'ca_mentor']
    when 'domains' then array['statutory_audit', 'internal_audit', 'risk_advisory', 'direct_tax', 'indirect_tax',
                              'transfer_pricing', 'financial_reporting', 'fpa', 'investment_banking', 'equity_research',
                              'consulting', 'deals', 'forensic', 'treasury', 'banking_credit', 'accounts_ops']
    when 'firm_types' then array['big4', 'network', 'mid_size', 'small']
    when 'languages' then array['english', 'hindi', 'marathi', 'gujarati', 'bengali', 'tamil', 'telugu', 'kannada',
                                'malayalam', 'punjabi', 'odia', 'urdu']
    when 'call_slots' then array['weekday_morning', 'weekday_lunch', 'weekday_evening', 'weekday_late', 'saturday', 'sunday']
    when 'weekly_hours' then array['2-3', '4-6', '7-10', '10+']
    when 'experience_years' then array['1-2', '2-3', '3-5', '5+']
    when 'mentoring_experience' then array['regularly', 'few_times', 'not_yet']
    when 'conflicts' then array['coaching_business', 'student_group', 'hiring', 'practising_ca', 'none']
    when 'heard_from' then array['msc_student', 'whatsapp_group', 'linkedin', 'instagram', 'youtube', 'friend', 'other']
    when 'hunt_stages' then array['not_started', 'preparing', 'applying', 'shortlisted', 'interviewing', 'offer', 'joined', 'on_hold']
    when 'checklist_items' then array['intro_sent', 'first_call', 'cv_reviewed', 'resources_shared', 'mock_interview',
                                      'offer_received', 'joining_formalities', 'joined', 'joining_post']
    when 'duties' then array['reply_within_5h', 'no_unread_eod', 'urgent_calls', 'weekly_call', 'cv_review', 'mock_interview',
                             'keep_them_applying', 'know_resources', 'joining_help', 'joining_post', 'elder_sibling',
                             'use_padam_gpt', 'log_on_dashboard', 'no_selling', 'no_poaching', 'no_guessing',
                             'no_placement_promise', 'privacy']
    when 'policy_consents' then array['code_of_conduct', 'payout_terms', 'data_consent']
    when 'required_consents' then array['reply_within_5h', 'no_unread_eod', 'urgent_calls', 'weekly_call', 'cv_review',
                                        'mock_interview', 'keep_them_applying', 'know_resources', 'joining_help',
                                        'joining_post', 'elder_sibling', 'use_padam_gpt', 'log_on_dashboard', 'no_selling',
                                        'no_poaching', 'no_guessing', 'no_placement_promise', 'privacy',
                                        'code_of_conduct', 'payout_terms', 'data_consent']
    when 'review_tags' then array['always_reachable', 'practical_advice', 'great_cv_help', 'great_mock', 'kept_me_going',
                                  'clear_next_steps', 'elder_sibling']
    when 'mentor_status' then array['draft', 'submitted', 'training_passed', 'approved', 'rejected', 'paused']
    when 'match_status' then array['active', 'completed', 'switched', 'ended']
    when 'match_source' then array['self', 'admin', 'switch']
    when 'payout_status' then array['unpaid', 'due', 'paid', 'void']
    when 'switch_status' then array['pending', 'approved', 'declined', 'withdrawn']
    when 'staff_roles' then array['admin', 'senior_mentor']
    -- Mentoring profiles with public reviews (topmate_url). Subdomains of these count too.
    when 'review_hosts' then array['topmate.io', 'adplist.org', 'mentorcruise.com', 'superpeer.com', 'unstop.com', 'preplaced.in']
  end
$$;

-- Fields the application needs per stage (STAGE_REQUIRED in core).
create or replace function public.mentorship_stage_required(p_stage text)
returns text[]
language sql immutable
set search_path = public, pg_temp
as $$
  select case p_stage
    when 'final_in_it' then array['final_attempt', 'it_company', 'it_domain', 'it_duration_months', 'it_start',
                                  'articleship_firm', 'articleship_firm_type', 'articleship_domain']
    when 'final_it_done' then array['final_attempt', 'it_company', 'it_domain', 'it_duration_months', 'it_start',
                                    'articleship_firm', 'articleship_firm_type', 'articleship_domain']
    when 'final_articleship_done' then array['final_attempt', 'articleship_firm', 'articleship_firm_type', 'articleship_domain']
    when 'in_articleship' then array['articleship_firm', 'articleship_firm_type', 'articleship_domain', 'articleship_year']
    when 'qualified_fresher' then array['qualified_on', 'employer', 'role_title', 'articleship_firm',
                                        'articleship_firm_type', 'articleship_domain']
    when 'qualified_experienced' then array['qualified_on', 'employer', 'role_title', 'experience_years',
                                            'articleship_firm', 'articleship_firm_type', 'articleship_domain']
    else array[]::text[]
  end
$$;

create or replace function public.mentorship_tier(p_stage text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case when p_stage in ('qualified_fresher', 'qualified_experienced') then 'ca_mentor' else 'peer_mentor' end
$$;

-- Raise one of the SPEC §4.1 error codes (core maps the message to friendly copy).
create or replace function public.mentorship_fail(p_code text, p_hint text default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_hint is null then
    raise exception using message = p_code, errcode = 'P0001';
  end if;
  raise exception using message = p_code, errcode = 'P0001', hint = p_hint;
end
$$;

-- enrollment.course slug -> program key (same aliases as COURSE_TO_PROGRAM).
create or replace function public.mentorship_course_program(p_course text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case lower(btrim(coalesce(p_course, '')))
    when 'industrial-training-mastery' then 'industrial-training'
    when 'industrial-training' then 'industrial-training'
    when 'ca-industrial-training' then 'industrial-training'
    when 'msc-industrial-training-program' then 'industrial-training'
    when 'industrial-training-program' then 'industrial-training'
    when 'msc-ca-industrial-training' then 'industrial-training'
    when 'msc-ca-freshers-program' then 'ca-fresher'
    when 'ca-freshers' then 'ca-fresher'
    when 'freshers' then 'ca-fresher'
    when 'ca-freshers-program' then 'ca-fresher'
    when 'msc-ca-freshers' then 'ca-fresher'
    when 'msc-articleship-program' then 'articleship'
    when 'articleship-excellence' then 'articleship'
  end
$$;

create or replace function public.mentorship_program_label(p_program text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case p_program
    when 'industrial-training' then 'Industrial Training'
    when 'articleship' then 'Articleship'
    when 'ca-fresher' then 'CA Freshers'
    else p_program
  end
$$;

-- Digits with country code ('098765 43210' -> '919876543210'), or null unless a valid Indian mobile.
create or replace function public.mentorship_norm_phone(p text)
returns text
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if length(d) = 11 and left(d, 1) = '0' then
    d := substr(d, 2);
  end if;
  if length(d) = 10 then
    d := '91' || d;
  end if;
  if d ~ '^91[6-9][0-9]{9}$' then
    return d;
  end if;
  return null;
end
$$;

create or replace function public.mentorship_first_name(p_name text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select nullif(upper(left(w, 1)) || substr(w, 2), '')
    from (select split_part(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ' ', 1) as w) x
$$;

-- 'Riya Sharma' -> 'Riya S.' (review author).
create or replace function public.mentorship_short_name(p_name text)
returns text
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  parts text[] := regexp_split_to_array(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ' ');
begin
  if coalesce(parts[1], '') = '' then
    return 'MSC student';
  end if;
  if cardinality(parts) = 1 then
    return public.mentorship_first_name(parts[1]);
  end if;
  return public.mentorship_first_name(parts[1]) || ' ' || upper(left(parts[cardinality(parts)], 1)) || '.';
end
$$;

-- Display name from auth metadata: full_name, name, or first_name + last_name.
create or replace function public.mentorship_meta_name(p_meta jsonb)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select nullif(left(btrim(coalesce(
           nullif(btrim(p_meta->>'full_name'), ''),
           nullif(btrim(p_meta->>'name'), ''),
           concat_ws(' ', nullif(btrim(p_meta->>'first_name'), ''), nullif(btrim(p_meta->>'last_name'), '')),
           '')), 80), '')
   where jsonb_typeof(p_meta) = 'object'
$$;

-- json / jsonb / JSON-text column value -> object (never throws).
create or replace function public.mentorship_obj(p jsonb)
returns jsonb
language plpgsql immutable
set search_path = public, pg_temp
as $$
begin
  if p is null then
    return '{}'::jsonb;
  elsif jsonb_typeof(p) = 'object' then
    return p;
  elsif jsonb_typeof(p) = 'string' then
    begin
      p := (p #>> '{}')::jsonb;
      if jsonb_typeof(p) = 'object' then
        return p;
      end if;
    exception when others then
      null;
    end;
  end if;
  return '{}'::jsonb;
end
$$;

create or replace function public.mentorship_safe_uuid(p text)
returns uuid
language plpgsql immutable
set search_path = public, pg_temp
as $$
begin
  return nullif(btrim(p), '')::uuid;
exception when others then
  return null;
end
$$;

-- Time in IST (Asia/Kolkata). Never depends on the session TimeZone.
create or replace function public.mentorship_ist_date(p_ts timestamptz default now())
returns date
language sql stable
set search_path = public, pg_temp
as $$
  select (p_ts at time zone 'Asia/Kolkata')::date
$$;

-- Start (00:00 IST) of an IST calendar day.
create or replace function public.mentorship_ist_midnight(p_day date)
returns timestamptz
language sql stable
set search_path = public, pg_temp
as $$
  select (p_day::timestamp at time zone 'Asia/Kolkata')
$$;

-- Monday (IST) of the week that contains p_ts. Pulse rows are keyed by this.
create or replace function public.mentorship_ist_week_start(p_ts timestamptz default now())
returns date
language sql stable
set search_path = public, pg_temp
as $$
  select d - (extract(isodow from d)::int - 1)
    from (select public.mentorship_ist_date(p_ts) as d) x
$$;

-- Week 1 = the first 7 IST days from p_started. Same rule as core weekNumber().
create or replace function public.mentorship_week_no(p_started timestamptz, p_at timestamptz default now())
returns int
language sql stable
set search_path = public, pg_temp
as $$
  select case when p_started is null then null
              else greatest(1, floor((public.mentorship_ist_date(p_at) - public.mentorship_ist_date(p_started))::numeric / 7)::int + 1)
         end
$$;

-- Built-in config defaults (used when a key is missing from mentorship_config).
create or replace function public.mentorship_cfg_default(p_key text)
returns jsonb
language sql immutable
set search_path = public, pg_temp
as $$
  select case p_key
    when 'mentor_fee_inr' then '500'::jsonb
    when 'lecture_video_url' then '""'::jsonb
    when 'padam_gpt_url' then '""'::jsonb
    when 'links_url' then '"https://www.mystudentclub.com/links"'::jsonb
    when 'escalation_contact' then '{"name": "Team My Student Club", "whatsapp": "", "email": ""}'::jsonb
    when 'programs_enabled' then '["industrial-training"]'::jsonb
    when 'quiz_pass_pct' then '80'::jsonb
    when 'quiz_cooldown_hours' then '24'::jsonb
    when 'review_after_days' then '28'::jsonb
    when 'max_mentees_cap' then '10'::jsonb
    when 'min_reviews_for_rating' then '3'::jsonb
    when 'switch_limit' then '1'::jsonb
    when 'unmatched_after_days' then '2'::jsonb
    when 'unmatched_since' then '"2026-10-01"'::jsonb
    when 'red_flag_call_days' then '8'::jsonb
  end
$$;

-- -----------------------------------------------------------------------------
-- 2. Tables. RLS on, no policies, everything revoked from anon/authenticated:
--    every read and write goes through the SECURITY DEFINER functions below.
-- -----------------------------------------------------------------------------

create table if not exists public.mentorship_config (
  key        text primary key check (key ~ '^[a-z_]{2,40}$'),
  value      jsonb not null,
  is_public  boolean not null default true,
  note       text check (note is null or char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.mentorship_staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role = any (public.mentorship_vocab('staff_roles'))),
  name       text check (name is null or char_length(name) <= 80),
  email      text check (email is null or char_length(email) <= 254),
  whatsapp   text check (whatsapp is null or whatsapp ~ '^91[6-9][0-9]{9}$'),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  added_by   uuid
);

create table if not exists public.mentorship_mentor (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users (id) on delete cascade,
  status                text not null default 'draft' check (status = any (public.mentorship_vocab('mentor_status'))),
  tier                  text check (tier is null or tier = any (public.mentorship_vocab('tiers'))),
  full_name             text check (full_name is null or char_length(full_name) <= 80),
  email                 text check (email is null or char_length(email) <= 254),
  mobile                text check (mobile is null or mobile ~ '^91[6-9][0-9]{9}$'),
  whatsapp              text check (whatsapp is null or whatsapp ~ '^91[6-9][0-9]{9}$'),
  city                  text check (city is null or char_length(city) <= 40),
  photo_path            text check (photo_path is null or char_length(photo_path) <= 300),
  linkedin_url          text check (linkedin_url is null or (linkedin_url ~ '^https://' and linkedin_url ~* 'linkedin\.com/in/'
                                                             and char_length(linkedin_url) <= 300)),
  show_linkedin         boolean not null default false,
  topmate_url           text check (topmate_url is null or (topmate_url ~ '^https://' and char_length(topmate_url) <= 300)),
  languages             text[] not null default '{}' check (languages <@ public.mentorship_vocab('languages') and cardinality(languages) <= 6),
  stage                 text check (stage is null or stage = any (public.mentorship_vocab('stages'))),
  final_attempt         text check (final_attempt is null or final_attempt ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  did_it                boolean,
  it_company            text check (it_company is null or char_length(it_company) <= 80),
  it_domain             text check (it_domain is null or it_domain = any (public.mentorship_vocab('domains'))),
  it_duration_months    smallint check (it_duration_months is null or it_duration_months between 1 and 24),
  it_start              text check (it_start is null or it_start ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  it_city               text check (it_city is null or char_length(it_city) <= 40),
  articleship_firm      text check (articleship_firm is null or char_length(articleship_firm) <= 80),
  articleship_firm_type text check (articleship_firm_type is null or articleship_firm_type = any (public.mentorship_vocab('firm_types'))),
  articleship_domain    text check (articleship_domain is null or articleship_domain = any (public.mentorship_vocab('domains'))),
  articleship_city      text check (articleship_city is null or char_length(articleship_city) <= 40),
  articleship_year      smallint check (articleship_year is null or articleship_year between 1 and 3),
  qualified_on          text check (qualified_on is null or qualified_on ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  employer              text check (employer is null or char_length(employer) <= 80),
  role_title            text check (role_title is null or char_length(role_title) <= 80),
  experience_years      text check (experience_years is null or experience_years = any (public.mentorship_vocab('experience_years'))),
  icai_number           text check (icai_number is null or char_length(icai_number) <= 20),
  scores                jsonb not null default '{}' check (jsonb_typeof(scores) = 'object'),
  domains               text[] not null default '{}' check (domains <@ public.mentorship_vocab('domains') and cardinality(domains) <= 6),
  companies_known       text[] not null default '{}' check (cardinality(companies_known) <= 15),
  headline              text check (headline is null or char_length(headline) <= 90),
  bio                   text check (bio is null or char_length(bio) <= 800),
  wish_i_knew           text check (wish_i_knew is null or char_length(wish_i_knew) <= 200),
  programs              text[] not null default '{industrial-training}' check (programs <@ public.mentorship_vocab('programs')),
  max_mentees           smallint not null default 5 check (max_mentees between 1 and 50),
  weekly_hours          text check (weekly_hours is null or weekly_hours = any (public.mentorship_vocab('weekly_hours'))),
  call_slots            text[] not null default '{}' check (call_slots <@ public.mentorship_vocab('call_slots')),
  accepting             boolean not null default true,
  cv_path               text check (cv_path is null or char_length(cv_path) <= 300),
  why_mentor            text check (why_mentor is null or char_length(why_mentor) <= 800),
  scenario_answer       text check (scenario_answer is null or char_length(scenario_answer) <= 900),
  mentoring_experience  text check (mentoring_experience is null or mentoring_experience = any (public.mentorship_vocab('mentoring_experience'))),
  conflicts             text[] not null default '{}' check (conflicts <@ public.mentorship_vocab('conflicts')),
  conflicts_note        text check (conflicts_note is null or char_length(conflicts_note) <= 300),
  heard_from            text check (heard_from is null or heard_from = any (public.mentorship_vocab('heard_from'))),
  consents              jsonb not null default '{}' check (jsonb_typeof(consents) = 'object'),
  training              jsonb not null default '{}' check (jsonb_typeof(training) = 'object'),
  quiz_passed_at        timestamptz,
  quiz_best_pct         smallint check (quiz_best_pct is null or quiz_best_pct between 0 and 100),
  quiz_attempts         int not null default 0,
  quiz_last_at          timestamptz,
  linkedin_checked      boolean not null default false,
  topmate_checked       boolean not null default false,
  staff_note            text check (staff_note is null or char_length(staff_note) <= 2000),
  senior_mentor_id      uuid references public.mentorship_staff (user_id) on delete set null,
  rating_avg            numeric(3, 2),
  review_count          int not null default 0,
  submitted_at          timestamptz,
  approved_at           timestamptz,
  approved_by           uuid,
  rejected_at           timestamptz,
  reject_reason         text check (reject_reason is null or char_length(reject_reason) <= 500),
  reapply_after         date,
  paused_at             timestamptz,
  pause_reason          text check (pause_reason is null or char_length(pause_reason) <= 500),
  status_changed_at     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists mentorship_mentor_status_idx on public.mentorship_mentor (status);
create index if not exists mentorship_mentor_programs_idx on public.mentorship_mentor using gin (programs);

-- whatsapp is nullable only because an admin can assign a mentee who never filled the
-- booking form (SPEC §4.2 admin_create_match); mentorship_save_student always sets it.
create table if not exists public.mentorship_student (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (char_length(full_name) between 1 and 80),
  email      text check (email is null or char_length(email) <= 254),
  whatsapp   text check (whatsapp is null or whatsapp ~ '^91[6-9][0-9]{9}$'),
  city       text check (city is null or char_length(city) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mentorship_match (
  id                uuid primary key default gen_random_uuid(),
  program           text not null check (program = any (public.mentorship_vocab('programs'))),
  mentor_id         uuid not null references public.mentorship_mentor (id) on delete cascade,
  mentee_user_id    uuid not null references auth.users (id) on delete cascade,
  status            text not null default 'active' check (status = any (public.mentorship_vocab('match_status'))),
  source            text not null default 'self' check (source = any (public.mentorship_vocab('match_source'))),
  previous_match_id uuid references public.mentorship_match (id) on delete set null,
  batch             text check (batch is null or char_length(batch) <= 80),
  fee_inr           int not null check (fee_inr between 0 and 100000),
  payout_status     text not null default 'unpaid' check (payout_status = any (public.mentorship_vocab('payout_status'))),
  payout_ref        text check (payout_ref is null or char_length(payout_ref) <= 120),
  paid_at           timestamptz,
  paid_by           uuid,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  end_reason        text check (end_reason is null or char_length(end_reason) <= 500),
  ended_by          uuid,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- One active mentor per student per program (booking races end here as already_matched).
create unique index if not exists mentorship_match_one_active_idx
  on public.mentorship_match (mentee_user_id, program) where status = 'active';
create index if not exists mentorship_match_mentor_active_idx on public.mentorship_match (mentor_id) where status = 'active';
create index if not exists mentorship_match_mentor_idx on public.mentorship_match (mentor_id);
create index if not exists mentorship_match_mentee_idx on public.mentorship_match (mentee_user_id);

create table if not exists public.mentorship_checklist (
  match_id   uuid not null references public.mentorship_match (id) on delete cascade,
  item       text not null check (item = any (public.mentorship_vocab('checklist_items'))),
  done_at    timestamptz not null default now(),
  note       text check (note is null or char_length(note) <= 300),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (match_id, item)
);

create table if not exists public.mentorship_call_log (
  id                 uuid primary key default gen_random_uuid(),
  match_id           uuid not null references public.mentorship_match (id) on delete cascade,
  week_no            smallint not null check (week_no between 1 and 60),
  called_on          date not null,
  hunt_stage         text check (hunt_stage is null or hunt_stage = any (public.mentorship_vocab('hunt_stages'))),
  applications_count int not null default 0 check (applications_count between 0 and 500),
  interviews_count   int not null default 0 check (interviews_count between 0 and 100),
  notes              text check (notes is null or char_length(notes) <= 1000),
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (match_id, week_no)
);

create table if not exists public.mentorship_pulse (
  id                 uuid primary key default gen_random_uuid(),
  match_id           uuid not null references public.mentorship_match (id) on delete cascade,
  mentee_user_id     uuid not null,
  week_start         date not null,
  applications_count int not null default 0 check (applications_count between 0 and 500),
  hunt_stage         text check (hunt_stage is null or hunt_stage = any (public.mentorship_vocab('hunt_stages'))),
  mentor_called      boolean not null,
  rating             smallint not null check (rating between 1 and 5),
  issue              text check (issue is null or char_length(issue) <= 1000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (match_id, week_start)
);
create index if not exists mentorship_pulse_mentee_idx on public.mentorship_pulse (mentee_user_id);

create table if not exists public.mentorship_review (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null unique references public.mentorship_match (id) on delete cascade,
  mentor_id      uuid not null,
  mentee_user_id uuid not null,
  rating         smallint not null check (rating between 1 and 5),
  tags           text[] not null default '{}' check (tags <@ public.mentorship_vocab('review_tags') and cardinality(tags) <= 3),
  body           text check (body is null or char_length(body) <= 600),
  safety_flag    boolean not null default false,
  private_note   text check (private_note is null or char_length(private_note) <= 1000),
  published      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists mentorship_review_mentor_idx on public.mentorship_review (mentor_id);

create table if not exists public.mentorship_quiz_question (
  id          text primary key check (id ~ '^[a-z0-9_]{2,20}$'),
  position    smallint not null,
  prompt      text not null,
  options     jsonb not null check (jsonb_typeof(options) = 'array'),
  correct_key text not null,
  explanation text,
  active      boolean not null default true
);

create table if not exists public.mentorship_quiz_attempt (
  id         uuid primary key default gen_random_uuid(),
  mentor_id  uuid not null references public.mentorship_mentor (id) on delete cascade,
  user_id    uuid not null,
  answers    jsonb not null default '{}',
  correct    int not null,
  total      int not null,
  score_pct  int not null,
  passed     boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists mentorship_quiz_attempt_mentor_idx on public.mentorship_quiz_attempt (mentor_id);

create table if not exists public.mentorship_switch_request (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references public.mentorship_match (id) on delete cascade,
  mentee_user_id  uuid not null,
  program         text not null check (program = any (public.mentorship_vocab('programs'))),
  reason          text not null check (char_length(reason) between 20 and 600),
  status          text not null default 'pending' check (status = any (public.mentorship_vocab('switch_status'))),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 600),
  resolved_by     uuid,
  resolved_at     timestamptz,
  new_match_id    uuid references public.mentorship_match (id) on delete set null,
  created_at      timestamptz not null default now()
);
create unique index if not exists mentorship_switch_one_pending_idx
  on public.mentorship_switch_request (match_id) where status = 'pending';
create index if not exists mentorship_switch_mentee_idx on public.mentorship_switch_request (mentee_user_id, program);

create table if not exists public.mentorship_event (
  id         bigserial primary key,
  actor_id   uuid,
  kind       text not null,
  mentor_id  uuid,
  match_id   uuid,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists mentorship_event_mentor_idx on public.mentorship_event (mentor_id, created_at desc);
create index if not exists mentorship_event_match_idx on public.mentorship_event (match_id);

-- Deny-all: RLS on with no policies, and no table rights for the API roles.
do $$
declare
  t text;
begin
  foreach t in array array['mentorship_config', 'mentorship_staff', 'mentorship_mentor', 'mentorship_student',
                           'mentorship_match', 'mentorship_checklist', 'mentorship_call_log', 'mentorship_pulse',
                           'mentorship_review', 'mentorship_quiz_question', 'mentorship_quiz_attempt',
                           'mentorship_switch_request', 'mentorship_event'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  revoke all on sequence public.mentorship_event_id_seq from public, anon, authenticated;
  grant all on sequence public.mentorship_event_id_seq to service_role;
end
$$;

-- -----------------------------------------------------------------------------
-- 3. Config, staff and data helpers (SECURITY DEFINER, internal)
-- -----------------------------------------------------------------------------

create or replace function public.mentorship_cfg(p_key text)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select c.value from public.mentorship_config c where c.key = p_key),
                  public.mentorship_cfg_default(p_key))
$$;

create or replace function public.mentorship_cfg_int(p_key text)
returns int
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  return round((public.mentorship_cfg(p_key) #>> '{}')::numeric)::int;
exception when others then
  return round((public.mentorship_cfg_default(p_key) #>> '{}')::numeric)::int;
end
$$;

create or replace function public.mentorship_enabled_programs()
returns text[]
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v text[];
begin
  select coalesce(array_agg(x), '{}') into v
    from jsonb_array_elements_text(public.mentorship_cfg('programs_enabled')) x
   where x = any (public.mentorship_vocab('programs'));
  return v;
exception when others then
  return array['industrial-training'];
end
$$;

-- True when auth.uid() is an active staff member (p_role 'admin' requires the admin role).
-- Granted to authenticated: the mentorship-cv storage policy calls it.
create or replace function public.mentorship_is_staff(p_role text default null)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.mentorship_staff s
                  where s.user_id = auth.uid() and s.active and (p_role is null or s.role = p_role))
$$;

create or replace function public.mentorship_require_staff(p_role text default null)
returns uuid
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  if not public.mentorship_is_staff(p_role) then
    perform public.mentorship_fail('forbidden', coalesce(p_role, 'staff'));
  end if;
  return auth.uid();
end
$$;

-- True when auth.uid() has a mentor row (any status). Granted to authenticated: the storage
-- insert policies use it, so only mentor applicants can upload a photo or a CV.
create or replace function public.mentorship_has_mentor_row()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.mentorship_mentor m where m.user_id = auth.uid())
$$;

create or replace function public.mentorship_log_event(p_kind text, p_mentor uuid, p_match uuid, p_detail jsonb default '{}')
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.mentorship_event (actor_id, kind, mentor_id, match_id, detail)
  values (auth.uid(), p_kind, p_mentor, p_match, coalesce(p_detail, '{}'::jsonb));
end
$$;

-- Whole public.profiles row as jsonb (guarded: the table or column types may differ).
create or replace function public.mentorship_profile_row(p_uid uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if p_uid is null or to_regclass('public.profiles') is null then
    return '{}'::jsonb;
  end if;
  execute 'select to_jsonb(p) from public.profiles p where p.uuid::text = $1 limit 1' into v using p_uid::text;
  return coalesce(v, '{}'::jsonb);
exception when others then
  return '{}'::jsonb;
end
$$;

-- A person's contact card: mentorship_student first, then public.profiles, then auth.
-- {user_id, full_name, first_name, whatsapp, email, city, has_student_row}
create or replace function public.mentorship_person(p_uid uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  s public.mentorship_student;
  v_email text;
  v_meta jsonb;
  v_prow jsonb := '{}'::jsonb;
  v_prof jsonb := '{}'::jsonb;
  v_name text;
  v_wa text;
  v_city text;
begin
  if p_uid is null then
    return null;
  end if;
  select * into s from public.mentorship_student where user_id = p_uid;
  select u.email, u.raw_user_meta_data into v_email, v_meta from auth.users u where u.id = p_uid;
  if s.user_id is null or s.whatsapp is null or s.city is null then
    v_prow := public.mentorship_profile_row(p_uid);
    v_prof := public.mentorship_obj(v_prow->'profile');
  end if;
  v_name := coalesce(nullif(btrim(s.full_name), ''), nullif(left(btrim(v_prof->>'name'), 80), ''),
                     public.mentorship_meta_name(v_meta), nullif(split_part(coalesce(v_email, s.email, ''), '@', 1), ''),
                     'MSC student');
  v_wa := coalesce(s.whatsapp,
                   public.mentorship_norm_phone(v_prof->>'contact_number'), public.mentorship_norm_phone(v_prof->>'phone'),
                   public.mentorship_norm_phone(v_prof->>'phone_number'), public.mentorship_norm_phone(v_prof->>'mobile'),
                   public.mentorship_norm_phone(v_prow->>'mobile_number'));
  v_city := coalesce(nullif(btrim(s.city), ''), nullif(left(btrim(v_prof->>'city'), 40), ''),
                     nullif(left(btrim(v_prof->>'location'), 40), ''));
  return jsonb_build_object('user_id', p_uid, 'full_name', v_name, 'first_name', public.mentorship_first_name(v_name),
                            'whatsapp', v_wa, 'email', coalesce(v_email, s.email), 'city', v_city,
                            'has_student_row', s.user_id is not null);
end
$$;

create or replace function public.mentorship_actor_name(p_uid uuid)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select nullif(btrim(s.name), '') from public.mentorship_staff s where s.user_id = p_uid),
                  (select nullif(btrim(m.full_name), '') from public.mentorship_mentor m where m.user_id = p_uid),
                  public.mentorship_person(p_uid)->>'full_name',
                  'System')
$$;

-- -----------------------------------------------------------------------------
-- 4. Enrollment (public.enrollment(uuid, course, batch, created_at), written by checkpayment)
--    Read through EXECUTE so this works where the table or a column is missing.
-- -----------------------------------------------------------------------------

create or replace function public.mentorship_col_exists(p_table text, p_col text)
returns boolean
language sql stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from pg_attribute a
                  where a.attrelid = to_regclass(p_table) and a.attname = p_col and a.attnum > 0 and not a.attisdropped)
$$;

create or replace function public.mentorship_enrolled_programs(p_user uuid)
returns text[]
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v text[];
begin
  if p_user is null or to_regclass('public.enrollment') is null then
    return '{}'::text[];
  end if;
  execute 'select coalesce(array_agg(distinct p order by p), ''{}''::text[])
             from (select public.mentorship_course_program(e.course::text) as p
                     from public.enrollment e where e.uuid::text = $1) x
            where p is not null'
     into v using p_user::text;
  return coalesce(v, '{}'::text[]);
exception when others then
  raise warning 'mentorship: enrollment lookup failed (% %)', sqlstate, sqlerrm;
  return '{}'::text[];
end
$$;

-- {enrolled_at, batch} of one student's enrollment in a program (newest row), or {}.
create or replace function public.mentorship_enrollment_info(p_user uuid, p_program text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
  v_created text := case when public.mentorship_col_exists('public.enrollment', 'created_at')
                         then 'e.created_at::timestamptz' else 'null::timestamptz' end;
  v_batch text := case when public.mentorship_col_exists('public.enrollment', 'batch')
                       then 'nullif(btrim(e.batch::text), '''')' else 'null::text' end;
begin
  if p_user is null or to_regclass('public.enrollment') is null then
    return '{}'::jsonb;
  end if;
  execute format('select jsonb_build_object(''enrolled_at'', %1$s, ''batch'', left(%2$s, 80))
                    from public.enrollment e
                   where e.uuid::text = $1 and public.mentorship_course_program(e.course::text) = $2
                   order by %1$s desc nulls last limit 1', v_created, v_batch)
     into v using p_user::text, p_program;
  return coalesce(v, '{}'::jsonb);
exception when others then
  raise warning 'mentorship: enrollment info failed (% %)', sqlstate, sqlerrm;
  return '{}'::jsonb;
end
$$;

-- Everyone enrolled in a program: one row per user with the first enrollment time and latest batch.
create or replace function public.mentorship_enrollment_users(p_program text)
returns table (user_id uuid, enrolled_at timestamptz, batch text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_created text := case when public.mentorship_col_exists('public.enrollment', 'created_at')
                         then 'e.created_at::timestamptz' else 'null::timestamptz' end;
  v_batch text := case when public.mentorship_col_exists('public.enrollment', 'batch')
                       then 'nullif(btrim(e.batch::text), '''')' else 'null::text' end;
begin
  if to_regclass('public.enrollment') is null then
    return;
  end if;
  return query execute format(
    'select public.mentorship_safe_uuid(e.uuid::text), min(%1$s), left(max(%2$s), 80)
       from public.enrollment e
      where public.mentorship_course_program(e.course::text) = $1
        and public.mentorship_safe_uuid(e.uuid::text) is not null
      group by 1', v_created, v_batch) using p_program;
exception when others then
  raise warning 'mentorship: enrollment list failed (% %)', sqlstate, sqlerrm;
  return;
end
$$;

-- -----------------------------------------------------------------------------
-- 5. Input validation helpers (raise invalid_input with the field name as hint)
-- -----------------------------------------------------------------------------

create or replace function public.mentorship_txt(p jsonb, p_max int, p_field text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s text;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p) not in ('string', 'number') then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  s := btrim(p #>> '{}', E' \t\r\n');
  if s = '' then
    return null;
  end if;
  if char_length(s) > p_max then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  return s;
end
$$;

create or replace function public.mentorship_int(p jsonb, p_min int, p_max int, p_field text)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s text;
  n numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p) not in ('string', 'number') then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  s := btrim(p #>> '{}');
  if s = '' then
    return null;
  end if;
  if s !~ '^-?[0-9]+(\.0+)?$' then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  n := s::numeric;
  if n < p_min or n > p_max then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  return n::int;
end
$$;

create or replace function public.mentorship_bool(p jsonb, p_field text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p) = 'boolean' then
    return (p #>> '{}')::boolean;
  end if;
  if jsonb_typeof(p) = 'string' and lower(p #>> '{}') in ('true', 'false') then
    return lower(p #>> '{}')::boolean;
  end if;
  perform public.mentorship_fail('invalid_input', p_field);
  return null;
end
$$;

create or replace function public.mentorship_key(p jsonb, p_vocab text, p_field text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s text := public.mentorship_txt(p, 60, p_field);
begin
  if s is not null and not (s = any (public.mentorship_vocab(p_vocab))) then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  return s;
end
$$;

-- JSON array of strings -> trimmed, de-duplicated text[] (order kept). p_vocab null = free text.
create or replace function public.mentorship_list(p jsonb, p_vocab text, p_max_items int, p_item_max int, p_field text)
returns text[]
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_out text[] := '{}';
  e jsonb;
  s text;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return '{}'::text[];
  end if;
  if jsonb_typeof(p) <> 'array' then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  for e in select x from jsonb_array_elements(p) x loop
    if jsonb_typeof(e) not in ('string', 'number') then
      perform public.mentorship_fail('invalid_input', p_field);
    end if;
    s := btrim(e #>> '{}');
    continue when s = '';
    if char_length(s) > p_item_max then
      perform public.mentorship_fail('invalid_input', p_field);
    end if;
    if p_vocab is not null and not (s = any (public.mentorship_vocab(p_vocab))) then
      perform public.mentorship_fail('invalid_input', p_field);
    end if;
    if p_vocab is null then
      continue when exists (select 1 from unnest(v_out) o where lower(o) = lower(s));
    else
      continue when s = any (v_out);
    end if;
    v_out := v_out || s;
  end loop;
  if cardinality(v_out) > p_max_items then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  return v_out;
end
$$;

-- https URL (a bare 'linkedin.com/in/x' gets https:// added), or null when empty.
create or replace function public.mentorship_url(p jsonb, p_field text, p_linkedin boolean default false)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s text := public.mentorship_txt(p, 300, p_field);
begin
  if s is null then
    return null;
  end if;
  if s !~* '^[a-z][a-z0-9+.-]*:' then
    s := 'https://' || s;
  end if;
  if s !~ '^https://[^\s<>"''`]+$' or char_length(s) > 300 then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  if p_linkedin and s !~* '^https://([a-z]{2,3}\.)?linkedin\.com/in/[^/?#\s]+' then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  return s;
end
$$;

-- Contact details hidden in free text (core hasContactDetails() is the same rule):
-- a 10-digit number, also when split by spaces, dots, brackets or dashes ("98765 43210",
-- "98765-43210", "+91 98765 43210"), an @, a link (http:, www., wa.me, t.me, chat.whatsapp,
-- bit.ly, a domain with a path) or the word telegram.
create or replace function public.mentorship_has_contact(p_text text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_text, '') <> ''
     and (regexp_replace(p_text, '([0-9])[ .()-]+(?=[0-9])', '\1', 'g') ~ '[0-9]{10}'
          or p_text ~* '@|https?:|www\.|\mwa\.me\M|\mt\.me\M|chat\.whatsapp|telegram|bit\.ly|\m[a-z0-9-]{2,}\.(com|in|io|me|ly|ee|co|org|net|link|app|gg|to|xyz)/')
$$;

-- Public profile text must not carry contact details (contact stays hidden until matched).
create or replace function public.mentorship_assert_no_contact(p_text text, p_field text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.mentorship_has_contact(p_text) then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
end
$$;

-- A person's name (core isValidPersonName() is the same rule): letters, spaces and . ' - only.
-- Non-Latin letters are allowed; digits, @, /, :, brackets and fullwidth forms are not, nor a
-- domain ending such as ".com" or "www.". Names reach official mails, so they must not carry a link.
create or replace function public.mentorship_name_ok(p_name text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select p_name is not null
     and char_length(p_name) between 1 and 80
     and p_name ~ '^[A-Za-z .''\u0080-॥॰-퟿-﻿-]+$'
     and p_name ~ '[A-Za-z\u0080-॥॰-퟿-﻿]'
     and p_name !~* 'www\.|\.(com|in|ly|me|io|co|org|net)\M'
$$;

create or replace function public.mentorship_name(p jsonb, p_field text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s text := public.mentorship_txt(p, 80, p_field);
begin
  if s is not null and not public.mentorship_name_ok(s) then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  return s;
end
$$;

-- A mentoring profile with public reviews (topmate_url): https on a host in vocab 'review_hosts'
-- (or a subdomain of one), with no port or user part.
create or replace function public.mentorship_review_url(p jsonb, p_field text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s text := public.mentorship_url(p, p_field);
  h text;
begin
  if s is null then
    return null;
  end if;
  h := lower(substring(s from '^https://([^/?#:@]+)'));
  if h is null or s !~* '^https://[^/?#:@]+([/?#]|$)'
     or not exists (select 1 from unnest(public.mentorship_vocab('review_hosts')) d
                     where h = d or right(h, char_length(d) + 1) = '.' || d) then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  return s;
end
$$;

create or replace function public.mentorship_ym(p jsonb, p_field text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s text := public.mentorship_txt(p, 7, p_field);
begin
  if s is not null and s !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  return s;
end
$$;

create or replace function public.mentorship_phone(p jsonb, p_field text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s text := public.mentorship_txt(p, 30, p_field);
  d text;
begin
  if s is null then
    return null;
  end if;
  d := public.mentorship_norm_phone(s);
  if d is null then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  return d;
end
$$;

-- Storage path inside the caller's own folder: '<uid>/<file>'.
create or replace function public.mentorship_path(p jsonb, p_uid uuid, p_field text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s text := public.mentorship_txt(p, 300, p_field);
begin
  if s is null then
    return null;
  end if;
  if left(s, 37) <> p_uid::text || '/' or s !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$' or s like '%..%' then
    perform public.mentorship_fail('invalid_input', p_field);
  end if;
  return s;
end
$$;

-- scores: {foundation:{marks,out_of,attempts,exempt}, inter:{...}, final:{...}, rank_note}; unknown keys dropped.
create or replace function public.mentorship_scores(p jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_part text;
  o jsonb;
  v_marks int;
  v_out_of int;
  v_attempts int;
  v_exempt boolean;
  v_note text;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p) <> 'object' then
    perform public.mentorship_fail('invalid_input', 'scores');
  end if;
  foreach v_part in array array['foundation', 'inter', 'final'] loop
    o := p->v_part;
    if o is null or jsonb_typeof(o) = 'null' then
      v_out := v_out || jsonb_build_object(v_part, null);
      continue;
    end if;
    if jsonb_typeof(o) <> 'object' then
      perform public.mentorship_fail('invalid_input', 'scores.' || v_part);
    end if;
    v_marks := public.mentorship_int(o->'marks', 0, 1000, 'scores.' || v_part);
    v_out_of := public.mentorship_int(o->'out_of', 100, 1000, 'scores.' || v_part);
    v_attempts := public.mentorship_int(o->'attempts', 1, 20, 'scores.' || v_part);
    if v_marks is not null and v_out_of is not null and v_marks > v_out_of then
      perform public.mentorship_fail('invalid_input', 'scores.' || v_part);
    end if;
    if v_part = 'foundation' then
      v_exempt := coalesce(public.mentorship_bool(o->'exempt', 'scores.foundation'), false);
      v_out := v_out || jsonb_build_object(v_part, jsonb_build_object('marks', v_marks, 'out_of', v_out_of,
                                                                      'attempts', v_attempts, 'exempt', v_exempt));
    else
      v_out := v_out || jsonb_build_object(v_part, jsonb_build_object('marks', v_marks, 'out_of', v_out_of,
                                                                      'attempts', v_attempts));
    end if;
  end loop;
  v_note := public.mentorship_txt(p->'rank_note', 120, 'scores.rank_note');
  return v_out || jsonb_build_object('rank_note', coalesce(v_note, ''));
end
$$;

-- -----------------------------------------------------------------------------
-- 6. Shapes (built in one place each)
-- -----------------------------------------------------------------------------

-- Public mentor shape (SPEC §4.3). Never includes user_id, email, mobile, whatsapp,
-- icai_number, scores, cv_path, screening answers, consents or staff fields.
create or replace function public.mentorship_public_mentor(m public.mentorship_mentor)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_active int;
  v_total int;
  v_slots int;
begin
  if m.id is null then
    return null;
  end if;
  select count(*) filter (where x.status = 'active'), count(*) into v_active, v_total
    from public.mentorship_match x where x.mentor_id = m.id;
  v_slots := greatest(0, m.max_mentees - v_active);
  return jsonb_build_object(
      'id', m.id, 'full_name', m.full_name, 'first_name', public.mentorship_first_name(m.full_name),
      'photo_path', m.photo_path, 'tier', m.tier, 'stage', m.stage, 'city', m.city,
      'languages', to_jsonb(m.languages), 'domains', to_jsonb(m.domains), 'programs', to_jsonb(m.programs),
      'headline', m.headline, 'bio', m.bio, 'wish_i_knew', m.wish_i_knew,
      'did_it', m.did_it, 'it_company', m.it_company, 'it_domain', m.it_domain,
      'it_duration_months', m.it_duration_months, 'it_start', m.it_start)
    || jsonb_build_object(
      'articleship_firm', m.articleship_firm, 'articleship_firm_type', m.articleship_firm_type,
      'articleship_domain', m.articleship_domain, 'articleship_city', m.articleship_city,
      'final_attempt', m.final_attempt, 'qualified_on', m.qualified_on, 'employer', m.employer,
      'role_title', m.role_title, 'experience_years', m.experience_years,
      'companies_known', to_jsonb(m.companies_known), 'call_slots', to_jsonb(m.call_slots),
      'topmate_url', m.topmate_url, 'linkedin_url', case when m.show_linkedin then m.linkedin_url end,
      'linkedin_checked', m.linkedin_checked, 'topmate_checked', m.topmate_checked)
    || jsonb_build_object(
      'rating_avg', m.rating_avg, 'review_count', m.review_count, 'mentees_total', v_total,
      'max_mentees', m.max_mentees, 'active_mentees', v_active, 'slots_left', v_slots,
      -- A paused mentor reads "Not taking mentees", not "Full": accepting needs the approved status too.
      'accepting', (m.accepting and m.status = 'approved'),
      'available', (m.status = 'approved' and m.accepting and v_slots > 0),
      'approved_at', m.approved_at);
end
$$;

-- The mentor's own full row (staff_note is staff-only and is blanked here).
create or replace function public.mentorship_own_mentor(m public.mentorship_mentor)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  pub jsonb := public.mentorship_public_mentor(m);
begin
  if m.id is null then
    return null;
  end if;
  return to_jsonb(m) || jsonb_build_object('staff_note', null, 'first_name', pub->'first_name',
           'active_mentees', pub->'active_mentees', 'mentees_total', pub->'mentees_total',
           'slots_left', pub->'slots_left', 'available', pub->'available');
end
$$;

-- Staff view of a mentor: full row + counts + senior mentor name.
create or replace function public.mentorship_admin_mentor_json(m public.mentorship_mentor)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  pub jsonb := public.mentorship_public_mentor(m);
begin
  if m.id is null then
    return null;
  end if;
  return to_jsonb(m) || jsonb_build_object(
    'first_name', pub->'first_name', 'active_count', pub->'active_mentees', 'active_mentees', pub->'active_mentees',
    'mentees_total', pub->'mentees_total', 'slots_left', pub->'slots_left', 'available', pub->'available',
    'senior_mentor_name', (select coalesce(nullif(btrim(s.name), ''), s.email) from public.mentorship_staff s
                            where s.user_id = m.senior_mentor_id),
    'consents_count', (select count(*) from jsonb_object_keys(m.consents) k
                        where k = any (public.mentorship_vocab('required_consents'))),
    'consents_total', cardinality(public.mentorship_vocab('required_consents')));
end
$$;

create or replace function public.mentorship_auth_email(p_uid uuid)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select u.email from auth.users u where u.id = p_uid
$$;

-- One match in the my_match.matches[] shape (the caller must be its mentee). The mentor's
-- WhatsApp and email are added only while the match is active (never the staff-only mobile),
-- and the checklist carries done dates only, never the mentor's notes.
create or replace function public.mentorship_student_match(p_match_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  m public.mentorship_match;
  mm public.mentorship_mentor;
  v_eligible timestamptz;
  v_pulse jsonb;
  v_pulses int;
  v_last_pulse timestamptz;
  v_review jsonb;
  v_switch jsonb;
  v_pending boolean;
  v_used int;
begin
  select * into m from public.mentorship_match where id = p_match_id;
  if not found then
    return null;
  end if;
  select * into mm from public.mentorship_mentor where id = m.mentor_id;
  select to_jsonb(p) into v_pulse from public.mentorship_pulse p
   where p.match_id = m.id and p.week_start = public.mentorship_ist_week_start(now());
  select count(*), max(p.updated_at) into v_pulses, v_last_pulse from public.mentorship_pulse p where p.match_id = m.id;
  select to_jsonb(r) into v_review from public.mentorship_review r where r.match_id = m.id;
  select jsonb_build_object('id', s.id, 'status', s.status, 'reason', s.reason, 'created_at', s.created_at,
                            'resolution_note', s.resolution_note, 'resolved_at', s.resolved_at)
    into v_switch
    from public.mentorship_switch_request s where s.match_id = m.id order by s.created_at desc limit 1;
  select exists (select 1 from public.mentorship_switch_request s
                  where s.mentee_user_id = m.mentee_user_id and s.program = m.program and s.status = 'pending'),
         (select count(*) from public.mentorship_switch_request s
           where s.mentee_user_id = m.mentee_user_id and s.program = m.program and s.status <> 'withdrawn')
    into v_pending, v_used;
  v_eligible := m.started_at + make_interval(days => public.mentorship_cfg_int('review_after_days'));
  return jsonb_build_object(
    'match_id', m.id, 'program', m.program, 'status', m.status, 'started_at', m.started_at, 'ended_at', m.ended_at,
    'week_no', public.mentorship_week_no(m.started_at, coalesce(m.ended_at, now())),
    'days_active', public.mentorship_ist_date(coalesce(m.ended_at, now())) - public.mentorship_ist_date(m.started_at),
    'mentor', case when m.status = 'active'
                   then public.mentorship_public_mentor(mm)
                        || jsonb_build_object('whatsapp', mm.whatsapp,
                                              'email', coalesce(public.mentorship_auth_email(mm.user_id), mm.email))
                   else public.mentorship_public_mentor(mm) end,
    'checklist', coalesce((select jsonb_object_agg(c.item, jsonb_build_object('done_at', c.done_at))
                             from public.mentorship_checklist c where c.match_id = m.id), '{}'::jsonb),
    'pulse_this_week', v_pulse, 'pulses_count', v_pulses, 'last_pulse_at', v_last_pulse,
    'review', v_review, 'review_eligible_at', v_eligible, 'can_review', now() >= v_eligible,
    'switch_request', v_switch,
    'switch_available', m.status = 'active' and not v_pending and v_used < public.mentorship_cfg_int('switch_limit'));
end
$$;

-- One match in the staff shape (admin_matches, admin_mentor_detail, create/reassign/end).
create or replace function public.mentorship_admin_match_json(p_match_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  m public.mentorship_match;
  mm public.mentorship_mentor;
  v_done int;
  v_last_call date;
  v_stage text;
  v_pulse jsonb;
  v_review jsonb;
begin
  select * into m from public.mentorship_match where id = p_match_id;
  if not found then
    return null;
  end if;
  select * into mm from public.mentorship_mentor where id = m.mentor_id;
  select count(*) into v_done from public.mentorship_checklist c where c.match_id = m.id;
  select c.called_on, c.hunt_stage into v_last_call, v_stage
    from public.mentorship_call_log c where c.match_id = m.id order by c.called_on desc, c.week_no desc limit 1;
  select jsonb_build_object('rating', p.rating, 'mentor_called', p.mentor_called, 'applications_count', p.applications_count,
                            'hunt_stage', p.hunt_stage, 'issue', p.issue, 'week_start', p.week_start,
                            'created_at', p.created_at, 'updated_at', p.updated_at)
    into v_pulse
    from public.mentorship_pulse p where p.match_id = m.id order by p.week_start desc, p.updated_at desc limit 1;
  select jsonb_build_object('rating', r.rating, 'safety_flag', r.safety_flag, 'published', r.published)
    into v_review from public.mentorship_review r where r.match_id = m.id;
  return jsonb_build_object(
    'match_id', m.id, 'program', m.program, 'status', m.status, 'started_at', m.started_at, 'ended_at', m.ended_at,
    'week_no', public.mentorship_week_no(m.started_at, coalesce(m.ended_at, now())), 'source', m.source,
    'batch', m.batch, 'end_reason', m.end_reason, 'previous_match_id', m.previous_match_id,
    'mentor', jsonb_build_object('id', mm.id, 'full_name', mm.full_name, 'first_name', public.mentorship_first_name(mm.full_name),
                                 'whatsapp', mm.whatsapp, 'email', coalesce(public.mentorship_auth_email(mm.user_id), mm.email),
                                 'status', mm.status),
    'mentee', public.mentorship_person(m.mentee_user_id),
    'checklist_done', v_done, 'checklist_total', cardinality(public.mentorship_vocab('checklist_items')),
    'last_call_on', v_last_call,
    'days_since_call', case when v_last_call is not null then public.mentorship_ist_date(now()) - v_last_call end,
    'latest_stage', v_stage, 'last_pulse', v_pulse, 'review', v_review,
    'fee_inr', m.fee_inr, 'payout_status', m.payout_status, 'paid_at', m.paid_at, 'payout_ref', m.payout_ref);
end
$$;

-- One mentee card for the mentor dashboard (mentorship_my_mentees item). Contact details
-- only while the match is active: a closed match shows the mentee's name only.
create or replace function public.mentorship_mentee_card(p_match_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  m public.mentorship_match;
  v_today date := public.mentorship_ist_date(now());
  v_call_days int := public.mentorship_cfg_int('red_flag_call_days');
  v_person jsonb;
  v_checklist jsonb;
  v_calls jsonb;
  v_calls_total int;
  v_last_call date;
  v_stage text;
  v_apps int;
  v_flags text[] := '{}';
begin
  select * into m from public.mentorship_match where id = p_match_id;
  if not found then
    return null;
  end if;
  v_person := public.mentorship_person(m.mentee_user_id);
  select coalesce(jsonb_object_agg(c.item, jsonb_build_object('done_at', c.done_at, 'note', coalesce(c.note, ''))), '{}'::jsonb)
    into v_checklist from public.mentorship_checklist c where c.match_id = m.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'week_no', x.week_no, 'called_on', x.called_on,
                                               'hunt_stage', x.hunt_stage, 'applications_count', x.applications_count,
                                               'interviews_count', x.interviews_count, 'notes', coalesce(x.notes, ''),
                                               'created_at', x.created_at)
                            order by x.called_on desc, x.week_no desc), '[]'::jsonb)
    into v_calls
    from (select * from public.mentorship_call_log c where c.match_id = m.id
           order by c.called_on desc, c.week_no desc limit 12) x;
  select count(*) into v_calls_total from public.mentorship_call_log c where c.match_id = m.id;
  select c.called_on, c.hunt_stage, c.applications_count into v_last_call, v_stage, v_apps
    from public.mentorship_call_log c where c.match_id = m.id order by c.called_on desc, c.week_no desc limit 1;
  if m.status = 'active' then
    -- No WhatsApp on file (an admin-assigned mentee who never filled the booking form): the
    -- mentor cannot send the intro, so the flag is about the missing number, not a late intro.
    if v_person->>'whatsapp' is null then
      v_flags := v_flags || 'mentee_no_contact'::text;
    elsif now() - m.started_at > interval '24 hours' and not (v_checklist ? 'intro_sent') then
      v_flags := v_flags || 'intro_late'::text;
    end if;
    if v_today - public.mentorship_ist_date(m.started_at) >= v_call_days
       and (v_last_call is null or v_last_call <= v_today - v_call_days) then
      v_flags := v_flags || 'no_call_8d'::text;
    end if;
  end if;
  return jsonb_build_object(
    'match_id', m.id, 'program', m.program, 'status', m.status, 'started_at', m.started_at, 'ended_at', m.ended_at,
    'week_no', public.mentorship_week_no(m.started_at, coalesce(m.ended_at, now())),
    'days_active', public.mentorship_ist_date(coalesce(m.ended_at, now())) - public.mentorship_ist_date(m.started_at),
    'mentee', case when m.status = 'active' then v_person - 'has_student_row'
                   else jsonb_build_object('user_id', v_person->'user_id', 'full_name', v_person->'full_name',
                                           'first_name', v_person->'first_name') end,
    'checklist', v_checklist, 'calls', v_calls, 'calls_total', v_calls_total,
    'last_call_on', v_last_call,
    'days_since_call', case when v_last_call is not null then v_today - v_last_call end,
    'latest_stage', v_stage, 'latest_applications', v_apps, 'flags', to_jsonb(v_flags));
end
$$;

create or replace function public.mentorship_review_json(r public.mentorship_review, p_staff boolean default false)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_mentee text := public.mentorship_person(r.mentee_user_id)->>'full_name';
  v_program text := (select m.program from public.mentorship_match m where m.id = r.match_id);
begin
  if r.id is null then
    return null;
  end if;
  if not p_staff then
    return jsonb_build_object('id', r.id, 'rating', r.rating, 'tags', to_jsonb(r.tags), 'body', coalesce(r.body, ''),
                              'author', public.mentorship_short_name(v_mentee), 'program', v_program,
                              'created_at', r.created_at);
  end if;
  return jsonb_build_object('id', r.id, 'match_id', r.match_id, 'mentor_id', r.mentor_id,
                            'mentor_name', (select mm.full_name from public.mentorship_mentor mm where mm.id = r.mentor_id),
                            'mentee_user_id', r.mentee_user_id, 'mentee_name', v_mentee,
                            'author', public.mentorship_short_name(v_mentee), 'program', v_program,
                            'rating', r.rating, 'tags', to_jsonb(r.tags), 'body', coalesce(r.body, ''),
                            'safety_flag', r.safety_flag, 'private_note', r.private_note, 'published', r.published,
                            'created_at', r.created_at, 'updated_at', r.updated_at);
end
$$;

-- Application fields still missing (SPEC §7 starred fields, STAGE_REQUIRED, scores, 21 consents).
create or replace function public.mentorship_missing_fields(m public.mentorship_mentor)
returns text[]
language plpgsql stable
set search_path = public, pg_temp
as $$
declare
  v text[] := '{}';
  j jsonb := to_jsonb(m);
  f text;
  s jsonb := coalesce(m.scores, '{}'::jsonb);
  v_qualified boolean := m.stage in ('qualified_fresher', 'qualified_experienced');
begin
  foreach f in array array['full_name', 'mobile', 'whatsapp', 'city', 'photo_path', 'linkedin_url'] loop
    if j->>f is null then
      v := v || f;
    end if;
  end loop;
  -- The draft starts with the auth name, which was never checked: it must be a real name too.
  if m.full_name is not null and not public.mentorship_name_ok(m.full_name) then
    v := v || 'full_name'::text;
  end if;
  if cardinality(m.languages) < 1 then
    v := v || 'languages'::text;
  end if;
  if m.stage is null then
    v := v || 'stage'::text;
  else
    foreach f in array public.mentorship_stage_required(m.stage) loop
      if j->>f is null then
        v := v || f;
      end if;
    end loop;
    if v_qualified and m.did_it is true then
      foreach f in array array['it_company', 'it_domain', 'it_duration_months'] loop
        if j->>f is null and not (f = any (v)) then
          v := v || f;
        end if;
      end loop;
    end if;
  end if;
  if not (coalesce((s->'foundation'->>'exempt')::boolean, false)
          or (s->'foundation'->>'marks' is not null and s->'foundation'->>'out_of' is not null
              and s->'foundation'->>'attempts' is not null)) then
    v := v || 'scores.foundation'::text;
  end if;
  if s->'inter'->>'marks' is null or s->'inter'->>'out_of' is null or s->'inter'->>'attempts' is null then
    v := v || 'scores.inter'::text;
  end if;
  if v_qualified and (s->'final'->>'marks' is null or s->'final'->>'out_of' is null or s->'final'->>'attempts' is null) then
    v := v || 'scores.final'::text;
  end if;
  if cardinality(m.domains) < 1 then
    v := v || 'domains'::text;
  end if;
  if m.headline is null then
    v := v || 'headline'::text;
  end if;
  if m.bio is null or char_length(m.bio) < 120 then
    v := v || 'bio'::text;
  end if;
  if cardinality(m.programs) < 1 then
    v := v || 'programs'::text;
  end if;
  if m.weekly_hours is null then
    v := v || 'weekly_hours'::text;
  end if;
  if cardinality(m.call_slots) < 1 then
    v := v || 'call_slots'::text;
  end if;
  if m.cv_path is null then
    v := v || 'cv_path'::text;
  end if;
  if m.why_mentor is null or char_length(m.why_mentor) < 80 then
    v := v || 'why_mentor'::text;
  end if;
  if m.scenario_answer is null or char_length(m.scenario_answer) < 120 then
    v := v || 'scenario_answer'::text;
  end if;
  if m.mentoring_experience is null then
    v := v || 'mentoring_experience'::text;
  end if;
  if cardinality(m.conflicts) < 1 then
    v := v || 'conflicts'::text;
  elsif exists (select 1 from unnest(m.conflicts) c where c <> 'none') and m.conflicts_note is null then
    v := v || 'conflicts_note'::text;
  end if;
  foreach f in array public.mentorship_vocab('required_consents') loop
    if not (m.consents ? f) then
      v := v || ('consents.' || f);
    end if;
  end loop;
  return v;
end
$$;

-- -----------------------------------------------------------------------------
-- 7. Triggers: updated_at, review stats
-- -----------------------------------------------------------------------------

create or replace function public.mentorship_trg_touch()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['mentorship_config', 'mentorship_staff', 'mentorship_mentor', 'mentorship_student',
                           'mentorship_match', 'mentorship_checklist', 'mentorship_call_log', 'mentorship_pulse',
                           'mentorship_review'] loop
    execute format('drop trigger if exists mentorship_trg_touch on public.%I', t);
    execute format('create trigger mentorship_trg_touch before update on public.%I
                      for each row execute function public.mentorship_trg_touch()', t);
  end loop;
end
$$;

-- rating_avg / review_count from published reviews only.
create or replace function public.mentorship_trg_review_stats()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[] := '{}';
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_ids := v_ids || new.mentor_id;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_ids := v_ids || old.mentor_id;
  end if;
  update public.mentorship_mentor mm
     set rating_avg = s.avg_rating, review_count = s.cnt
    from (select i.id,
                 (select round(avg(r.rating)::numeric, 2) from public.mentorship_review r
                   where r.mentor_id = i.id and r.published) as avg_rating,
                 (select count(*)::int from public.mentorship_review r
                   where r.mentor_id = i.id and r.published) as cnt
            from (select distinct x as id from unnest(v_ids) x where x is not null) i) s
   where mm.id = s.id
     and (mm.rating_avg is distinct from s.avg_rating or mm.review_count is distinct from s.cnt);
  return null;
end
$$;

drop trigger if exists mentorship_trg_review_stats on public.mentorship_review;
create trigger mentorship_trg_review_stats after insert or update or delete on public.mentorship_review
  for each row execute function public.mentorship_trg_review_stats();

-- -----------------------------------------------------------------------------
-- 8. Public and signed-in RPCs
-- -----------------------------------------------------------------------------

create or replace function public.mentorship_get_config()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb) from public.mentorship_config c where c.is_public
$$;

create or replace function public.mentorship_whoami()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_meta jsonb;
  m public.mentorship_mentor;
  s public.mentorship_student;
  v_role text;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  select u.email, u.raw_user_meta_data into v_email, v_meta from auth.users u where u.id = v_uid;
  select * into m from public.mentorship_mentor where user_id = v_uid;
  select * into s from public.mentorship_student where user_id = v_uid;
  select st.role into v_role from public.mentorship_staff st where st.user_id = v_uid and st.active;
  return jsonb_build_object(
    'user_id', v_uid,
    'email', coalesce(v_email, s.email),
    'name', coalesce(nullif(btrim(m.full_name), ''), nullif(btrim(s.full_name), ''), public.mentorship_meta_name(v_meta),
                     nullif(split_part(coalesce(v_email, ''), '@', 1), '')),
    'staff_role', v_role,
    'mentor', case when m.id is null then null else
                jsonb_build_object('id', m.id, 'status', m.status, 'tier', m.tier, 'full_name', m.full_name,
                                   'photo_path', m.photo_path, 'quiz_passed_at', m.quiz_passed_at, 'accepting', m.accepting)
              end,
    'student', case when s.user_id is null then null else
                 jsonb_build_object('full_name', s.full_name, 'whatsapp', s.whatsapp, 'city', s.city,
                                    'email', coalesce(v_email, s.email))
               end,
    'enrolled_programs', to_jsonb(public.mentorship_enrolled_programs(v_uid)),
    'active_matches', coalesce((select jsonb_agg(jsonb_build_object('match_id', x.id, 'program', x.program,
                                                                   'mentor_id', x.mentor_id) order by x.started_at)
                                  from public.mentorship_match x
                                 where x.mentee_user_id = v_uid and x.status = 'active'), '[]'::jsonb),
    -- Programs where the mentorship finished (completed) or was closed by Team MSC (ended) and
    -- no match is active: self-booking is closed there (mentorship_book), Team MSC re-matches.
    'closed_matches', coalesce((select jsonb_agg(jsonb_build_object('match_id', c.id, 'program', c.program,
                                                                   'status', c.status, 'mentor_id', c.mentor_id)
                                                 order by c.program)
                                  from (select distinct on (x.program) x.*
                                          from public.mentorship_match x
                                         where x.mentee_user_id = v_uid and x.status in ('completed', 'ended')
                                           and not exists (select 1 from public.mentorship_match y
                                                            where y.mentee_user_id = v_uid and y.program = x.program
                                                              and y.status = 'active')
                                         order by x.program, (x.status = 'completed') desc, x.ended_at desc nulls last) c),
                               '[]'::jsonb));
end
$$;

-- -----------------------------------------------------------------------------
-- 9. Mentor RPCs
-- -----------------------------------------------------------------------------

create or replace function public.mentorship_save_mentor(p_patch jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  p jsonb := coalesce(p_patch, '{}'::jsonb);
  m public.mentorship_mentor;
  v_email text;
  v_meta jsonb;
  v_allowed text[];
  v_active int;
  v_int int;
  v_bool boolean;
  v_consents jsonb;
  k text;
  val jsonb;
  v_constraint text;
  v_old public.mentorship_mentor;
  v_changed text[] := '{}';
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p) <> 'object' then
    perform public.mentorship_fail('invalid_input', 'patch');
  end if;
  select u.email, u.raw_user_meta_data into v_email, v_meta from auth.users u where u.id = v_uid;

  select * into m from public.mentorship_mentor where user_id = v_uid for update;
  if not found then
    insert into public.mentorship_mentor (user_id, status, email, full_name)
    values (v_uid, 'draft', v_email, public.mentorship_meta_name(v_meta))
    on conflict (user_id) do nothing;
    select * into m from public.mentorship_mentor where user_id = v_uid for update;
  end if;
  v_old := m;

  if m.status in ('draft', 'rejected') then
    v_allowed := array['full_name', 'mobile', 'whatsapp', 'city', 'photo_path', 'linkedin_url', 'show_linkedin',
                       'topmate_url', 'languages', 'stage', 'final_attempt', 'did_it', 'it_company', 'it_domain',
                       'it_duration_months', 'it_start', 'it_city', 'articleship_firm', 'articleship_firm_type',
                       'articleship_domain', 'articleship_city', 'articleship_year', 'qualified_on', 'employer',
                       'role_title', 'experience_years', 'icai_number', 'scores', 'domains', 'companies_known',
                       'headline', 'bio', 'wish_i_knew', 'programs', 'max_mentees', 'weekly_hours', 'call_slots',
                       'accepting', 'cv_path', 'why_mentor', 'scenario_answer', 'mentoring_experience', 'conflicts',
                       'conflicts_note', 'heard_from', 'consents'];
  else
    v_allowed := array['photo_path', 'cv_path', 'headline', 'bio', 'wish_i_knew', 'languages', 'city', 'mobile',
                       'whatsapp', 'linkedin_url', 'show_linkedin', 'topmate_url', 'domains', 'companies_known',
                       'call_slots', 'weekly_hours', 'programs', 'accepting', 'max_mentees'];
  end if;
  -- Keys that are not allowed for this status (or unknown) are ignored, so autosave can send whole forms.
  p := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(p) e where e.key = any (v_allowed));

  if p ? 'full_name' then m.full_name := public.mentorship_name(p->'full_name', 'full_name'); end if;
  if p ? 'mobile' then m.mobile := public.mentorship_phone(p->'mobile', 'mobile'); end if;
  if p ? 'whatsapp' then m.whatsapp := public.mentorship_phone(p->'whatsapp', 'whatsapp'); end if;
  if p ? 'city' then
    m.city := public.mentorship_txt(p->'city', 40, 'city');
    perform public.mentorship_assert_no_contact(m.city, 'city');
  end if;
  if p ? 'photo_path' then m.photo_path := public.mentorship_path(p->'photo_path', v_uid, 'photo_path'); end if;
  if p ? 'linkedin_url' then m.linkedin_url := public.mentorship_url(p->'linkedin_url', 'linkedin_url', true); end if;
  if p ? 'show_linkedin' then m.show_linkedin := coalesce(public.mentorship_bool(p->'show_linkedin', 'show_linkedin'), false); end if;
  if p ? 'topmate_url' then m.topmate_url := public.mentorship_review_url(p->'topmate_url', 'topmate_url'); end if;
  if p ? 'languages' then m.languages := public.mentorship_list(p->'languages', 'languages', 6, 40, 'languages'); end if;
  if p ? 'stage' then m.stage := public.mentorship_key(p->'stage', 'stages', 'stage'); end if;
  if p ? 'final_attempt' then m.final_attempt := public.mentorship_ym(p->'final_attempt', 'final_attempt'); end if;
  if p ? 'did_it' then m.did_it := public.mentorship_bool(p->'did_it', 'did_it'); end if;
  if p ? 'it_company' then
    m.it_company := public.mentorship_txt(p->'it_company', 80, 'it_company');
    perform public.mentorship_assert_no_contact(m.it_company, 'it_company');
  end if;
  if p ? 'it_domain' then m.it_domain := public.mentorship_key(p->'it_domain', 'domains', 'it_domain'); end if;
  if p ? 'it_duration_months' then m.it_duration_months := public.mentorship_int(p->'it_duration_months', 1, 24, 'it_duration_months'); end if;
  if p ? 'it_start' then m.it_start := public.mentorship_ym(p->'it_start', 'it_start'); end if;
  if p ? 'it_city' then
    m.it_city := public.mentorship_txt(p->'it_city', 40, 'it_city');
    perform public.mentorship_assert_no_contact(m.it_city, 'it_city');
  end if;
  if p ? 'articleship_firm' then
    m.articleship_firm := public.mentorship_txt(p->'articleship_firm', 80, 'articleship_firm');
    perform public.mentorship_assert_no_contact(m.articleship_firm, 'articleship_firm');
  end if;
  if p ? 'articleship_firm_type' then m.articleship_firm_type := public.mentorship_key(p->'articleship_firm_type', 'firm_types', 'articleship_firm_type'); end if;
  if p ? 'articleship_domain' then m.articleship_domain := public.mentorship_key(p->'articleship_domain', 'domains', 'articleship_domain'); end if;
  if p ? 'articleship_city' then
    m.articleship_city := public.mentorship_txt(p->'articleship_city', 40, 'articleship_city');
    perform public.mentorship_assert_no_contact(m.articleship_city, 'articleship_city');
  end if;
  if p ? 'articleship_year' then m.articleship_year := public.mentorship_int(p->'articleship_year', 1, 3, 'articleship_year'); end if;
  if p ? 'qualified_on' then m.qualified_on := public.mentorship_ym(p->'qualified_on', 'qualified_on'); end if;
  if p ? 'employer' then
    m.employer := public.mentorship_txt(p->'employer', 80, 'employer');
    perform public.mentorship_assert_no_contact(m.employer, 'employer');
  end if;
  if p ? 'role_title' then
    m.role_title := public.mentorship_txt(p->'role_title', 80, 'role_title');
    perform public.mentorship_assert_no_contact(m.role_title, 'role_title');
  end if;
  if p ? 'experience_years' then m.experience_years := public.mentorship_key(p->'experience_years', 'experience_years', 'experience_years'); end if;
  if p ? 'icai_number' then m.icai_number := public.mentorship_txt(p->'icai_number', 20, 'icai_number'); end if;
  if p ? 'scores' then m.scores := public.mentorship_scores(p->'scores'); end if;
  if p ? 'domains' then m.domains := public.mentorship_list(p->'domains', 'domains', 6, 40, 'domains'); end if;
  -- Public profile text carries no phone numbers, emails or links (contact details stay hidden until matched).
  if p ? 'companies_known' then
    m.companies_known := public.mentorship_list(p->'companies_known', null, 15, 60, 'companies_known');
    perform public.mentorship_assert_no_contact(c, 'companies_known') from unnest(m.companies_known) c;
  end if;
  if p ? 'headline' then
    m.headline := public.mentorship_txt(p->'headline', 90, 'headline');
    perform public.mentorship_assert_no_contact(m.headline, 'headline');
  end if;
  if p ? 'bio' then
    m.bio := public.mentorship_txt(p->'bio', 800, 'bio');
    perform public.mentorship_assert_no_contact(m.bio, 'bio');
  end if;
  if p ? 'wish_i_knew' then
    m.wish_i_knew := public.mentorship_txt(p->'wish_i_knew', 200, 'wish_i_knew');
    perform public.mentorship_assert_no_contact(m.wish_i_knew, 'wish_i_knew');
  end if;
  if p ? 'programs' then m.programs := public.mentorship_list(p->'programs', 'programs', 3, 40, 'programs'); end if;
  if p ? 'max_mentees' then
    v_int := public.mentorship_int(p->'max_mentees', 1, public.mentorship_cfg_int('max_mentees_cap'), 'max_mentees');
    if v_int is not null then
      select count(*) into v_active from public.mentorship_match x where x.mentor_id = m.id and x.status = 'active';
      if v_int < v_active then
        perform public.mentorship_fail('invalid_input', 'max_mentees_below_active');
      end if;
      m.max_mentees := v_int;
    end if;
  end if;
  if p ? 'weekly_hours' then m.weekly_hours := public.mentorship_key(p->'weekly_hours', 'weekly_hours', 'weekly_hours'); end if;
  if p ? 'call_slots' then m.call_slots := public.mentorship_list(p->'call_slots', 'call_slots', 6, 40, 'call_slots'); end if;
  if p ? 'accepting' then
    v_bool := public.mentorship_bool(p->'accepting', 'accepting');
    if v_bool is not null then
      m.accepting := v_bool;
    end if;
  end if;
  if p ? 'cv_path' then m.cv_path := public.mentorship_path(p->'cv_path', v_uid, 'cv_path'); end if;
  if p ? 'why_mentor' then m.why_mentor := public.mentorship_txt(p->'why_mentor', 800, 'why_mentor'); end if;
  if p ? 'scenario_answer' then m.scenario_answer := public.mentorship_txt(p->'scenario_answer', 900, 'scenario_answer'); end if;
  if p ? 'mentoring_experience' then m.mentoring_experience := public.mentorship_key(p->'mentoring_experience', 'mentoring_experience', 'mentoring_experience'); end if;
  if p ? 'conflicts' then
    m.conflicts := public.mentorship_list(p->'conflicts', 'conflicts', 5, 40, 'conflicts');
    -- 'none' must be alone; when real conflicts are ticked too, keep the declared ones.
    if 'none' = any (m.conflicts) and cardinality(m.conflicts) > 1 then
      m.conflicts := array_remove(m.conflicts, 'none');
    end if;
  end if;
  if p ? 'conflicts_note' then m.conflicts_note := public.mentorship_txt(p->'conflicts_note', 300, 'conflicts_note'); end if;
  if p ? 'heard_from' then m.heard_from := public.mentorship_key(p->'heard_from', 'heard_from', 'heard_from'); end if;
  if p ? 'consents' and jsonb_typeof(p->'consents') <> 'null' then
    if jsonb_typeof(p->'consents') <> 'object' then
      perform public.mentorship_fail('invalid_input', 'consents');
    end if;
    v_consents := m.consents;
    for k, val in select e.key, e.value from jsonb_each(p->'consents') e loop
      continue when not (k = any (public.mentorship_vocab('required_consents')));
      if val = 'true'::jsonb then
        -- The server stamps the time; the first consent time is kept.
        if not (v_consents ? k) then
          v_consents := v_consents || jsonb_build_object(k, now());
        end if;
      elsif val = 'false'::jsonb or jsonb_typeof(val) = 'null' then
        v_consents := v_consents - k;
      else
        perform public.mentorship_fail('invalid_input', 'consents.' || k);
      end if;
    end loop;
    m.consents := v_consents;
  end if;

  -- A changed LinkedIn or Topmate link is no longer the one Team MSC checked: the tick goes, and
  -- staff see the change on the mentor's timeline (a new photo too, once the mentor is live).
  if m.linkedin_url is distinct from v_old.linkedin_url then
    m.linkedin_checked := false;
    v_changed := v_changed || 'linkedin_url'::text;
  end if;
  if m.topmate_url is distinct from v_old.topmate_url then
    m.topmate_checked := false;
    v_changed := v_changed || 'topmate_url'::text;
  end if;
  if m.photo_path is distinct from v_old.photo_path and m.status in ('approved', 'paused') then
    v_changed := v_changed || 'photo_path'::text;
  end if;

  begin
    update public.mentorship_mentor set
      email = coalesce(v_email, email),
      full_name = m.full_name, mobile = m.mobile, whatsapp = m.whatsapp, city = m.city, photo_path = m.photo_path,
      linkedin_url = m.linkedin_url, show_linkedin = m.show_linkedin, topmate_url = m.topmate_url,
      languages = m.languages, stage = m.stage, final_attempt = m.final_attempt, did_it = m.did_it,
      it_company = m.it_company, it_domain = m.it_domain, it_duration_months = m.it_duration_months,
      it_start = m.it_start, it_city = m.it_city, articleship_firm = m.articleship_firm,
      articleship_firm_type = m.articleship_firm_type, articleship_domain = m.articleship_domain,
      articleship_city = m.articleship_city, articleship_year = m.articleship_year, qualified_on = m.qualified_on,
      employer = m.employer, role_title = m.role_title, experience_years = m.experience_years,
      icai_number = m.icai_number, scores = m.scores, domains = m.domains, companies_known = m.companies_known,
      headline = m.headline, bio = m.bio, wish_i_knew = m.wish_i_knew, programs = m.programs,
      max_mentees = m.max_mentees, weekly_hours = m.weekly_hours, call_slots = m.call_slots,
      accepting = m.accepting, cv_path = m.cv_path, why_mentor = m.why_mentor,
      scenario_answer = m.scenario_answer, mentoring_experience = m.mentoring_experience,
      conflicts = m.conflicts, conflicts_note = m.conflicts_note, heard_from = m.heard_from,
      consents = m.consents, linkedin_checked = m.linkedin_checked, topmate_checked = m.topmate_checked
    where id = m.id
    returning * into m;
  exception when check_violation or not_null_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform public.mentorship_fail('invalid_input',
      coalesce(nullif(regexp_replace(coalesce(v_constraint, ''), '^mentorship_mentor_(.*)_check$', '\1'), ''), 'patch'));
  end;
  if cardinality(v_changed) > 0 and m.status <> 'draft' then
    perform public.mentorship_log_event('profile_link_changed', m.id, null,
      jsonb_build_object('fields', to_jsonb(v_changed),
                         'linkedin_checked_reset', v_old.linkedin_checked and 'linkedin_url' = any (v_changed),
                         'topmate_checked_reset', v_old.topmate_checked and 'topmate_url' = any (v_changed)));
  end if;
  return public.mentorship_own_mentor(m);
end
$$;

create or replace function public.mentorship_submit_application()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  m public.mentorship_mentor;
  v_missing text[];
  v_from text;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  select * into m from public.mentorship_mentor where user_id = v_uid for update;
  if not found then
    perform public.mentorship_fail('not_found', 'mentor');
  end if;
  if m.status in ('submitted', 'training_passed', 'approved', 'paused') then
    return jsonb_build_object('ok', true, 'status', m.status, 'missing', '[]'::jsonb);
  end if;
  if m.status = 'rejected' and m.reapply_after is not null and m.reapply_after > public.mentorship_ist_date(now()) then
    perform public.mentorship_fail('reapply_later', m.reapply_after::text);
  end if;
  v_missing := public.mentorship_missing_fields(m);
  if cardinality(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'status', m.status, 'missing', to_jsonb(v_missing));
  end if;
  v_from := m.status;
  -- A re-application whose quiz was already passed goes straight back to review.
  update public.mentorship_mentor
     set status = case when quiz_passed_at is not null then 'training_passed' else 'submitted' end,
         submitted_at = now(), tier = public.mentorship_tier(stage), status_changed_at = now()
   where id = m.id
  returning * into m;
  perform public.mentorship_log_event('application_submitted', m.id, null,
    jsonb_build_object('from', v_from, 'to', m.status, 'tier', m.tier));
  return jsonb_build_object('ok', true, 'status', m.status, 'missing', '[]'::jsonb);
end
$$;

create or replace function public.mentorship_my_mentor()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  m public.mentorship_mentor;
  v_active int;
  v_rows jsonb;
  v_sum jsonb;
  v_esc jsonb;
  v_cooldown int := public.mentorship_cfg_int('quiz_cooldown_hours');
  v_next timestamptz;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  select * into m from public.mentorship_mentor where user_id = v_uid;
  if not found then
    perform public.mentorship_fail('not_found', 'mentor');
  end if;
  select count(*) into v_active from public.mentorship_match x where x.mentor_id = m.id and x.status = 'active';
  select coalesce(jsonb_agg(jsonb_build_object(
           'match_id', x.id, 'mentee_name', public.mentorship_person(x.mentee_user_id)->>'full_name',
           'program', x.program, 'status', x.status, 'started_at', x.started_at, 'fee_inr', x.fee_inr,
           'payout_status', x.payout_status, 'paid_at', x.paid_at, 'payout_ref', x.payout_ref)
         order by x.started_at desc), '[]'::jsonb),
         jsonb_build_object(
           'active_value_inr', coalesce(sum(x.fee_inr) filter (where x.status = 'active'), 0),
           'unpaid_inr', coalesce(sum(x.fee_inr) filter (where x.payout_status = 'unpaid'), 0),
           'due_inr', coalesce(sum(x.fee_inr) filter (where x.payout_status = 'due'), 0),
           'paid_inr', coalesce(sum(x.fee_inr) filter (where x.payout_status = 'paid'), 0))
    into v_rows, v_sum
    from public.mentorship_match x where x.mentor_id = m.id;
  select jsonb_build_object('name', coalesce(nullif(btrim(s.name), ''), 'Your senior mentor'),
                            'whatsapp', coalesce(s.whatsapp, ''),
                            'email', coalesce(s.email, public.mentorship_auth_email(s.user_id), ''),
                            'role', s.role)
    into v_esc
    from public.mentorship_staff s where s.user_id = m.senior_mentor_id and s.active;
  if v_esc is null then
    v_esc := public.mentorship_obj(public.mentorship_cfg('escalation_contact')) || jsonb_build_object('role', 'team');
  end if;
  if m.quiz_passed_at is null and m.quiz_attempts > 0
     and m.quiz_last_at + make_interval(hours => v_cooldown) > now() then
    v_next := m.quiz_last_at + make_interval(hours => v_cooldown);
  end if;
  return jsonb_build_object(
    'mentor', public.mentorship_own_mentor(m),
    'active_count', v_active,
    'slots_left', greatest(0, m.max_mentees - v_active),
    'earnings', jsonb_build_object('fee_inr', public.mentorship_cfg_int('mentor_fee_inr'), 'active_count', v_active)
                || v_sum || jsonb_build_object('rows', v_rows),
    'escalation', v_esc,
    'quiz', jsonb_build_object('attempts', m.quiz_attempts, 'best_pct', m.quiz_best_pct, 'passed_at', m.quiz_passed_at,
                               'last_attempt_at', m.quiz_last_at, 'next_attempt_at', v_next,
                               'pass_pct', public.mentorship_cfg_int('quiz_pass_pct'), 'cooldown_hours', v_cooldown),
    'consents_missing', coalesce((select jsonb_agg(k) from unnest(public.mentorship_vocab('required_consents')) k
                                   where not (m.consents ? k)), '[]'::jsonb));
end
$$;

create or replace function public.mentorship_mark_training(p_step text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  m public.mentorship_mentor;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  select * into m from public.mentorship_mentor where user_id = v_uid for update;
  if not found or m.status = 'draft' then
    perform public.mentorship_fail('quiz_locked');
  end if;
  if p_step is null or p_step not in ('lecture', 'playbook') then
    perform public.mentorship_fail('invalid_input', 'step');
  end if;
  if not (m.training ? (p_step || '_at')) then
    update public.mentorship_mentor
       set training = training || jsonb_build_object(p_step || '_at', now())
     where id = m.id
    returning * into m;
  end if;
  return jsonb_build_object('training', m.training);
end
$$;

create or replace function public.mentorship_quiz_questions()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  m public.mentorship_mentor;
  v_cooldown int := public.mentorship_cfg_int('quiz_cooldown_hours');
  v_next timestamptz;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  select * into m from public.mentorship_mentor where user_id = v_uid;
  if not found or m.status not in ('submitted', 'training_passed', 'approved', 'paused') then
    perform public.mentorship_fail('quiz_locked');
  end if;
  if m.quiz_passed_at is null and m.quiz_attempts > 0
     and m.quiz_last_at + make_interval(hours => v_cooldown) > now() then
    v_next := m.quiz_last_at + make_interval(hours => v_cooldown);
  end if;
  return jsonb_build_object(
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'position', q.position, 'prompt', q.prompt,
                                                               'options', (select coalesce(jsonb_agg(jsonb_build_object('key', o.v->>'key', 'text', o.v->>'text') order by o.i), '[]'::jsonb)
                                                                             from jsonb_array_elements(q.options) with ordinality as o(v, i)))
                                            order by q.position, q.id)
                             from public.mentorship_quiz_question q where q.active), '[]'::jsonb),
    'pass_pct', public.mentorship_cfg_int('quiz_pass_pct'),
    'cooldown_hours', v_cooldown,
    'attempts', m.quiz_attempts,
    'passed_at', m.quiz_passed_at,
    'next_attempt_at', v_next);
end
$$;

create or replace function public.mentorship_submit_quiz(p_answers jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  m public.mentorship_mentor;
  a jsonb := coalesce(p_answers, '{}'::jsonb);
  v_pass int := public.mentorship_cfg_int('quiz_pass_pct');
  v_cooldown int := public.mentorship_cfg_int('quiz_cooldown_hours');
  v_total int;
  v_correct int;
  v_wrong jsonb;
  v_expl jsonb;
  v_passed boolean;
  v_pct int;
  v_clean jsonb;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  if jsonb_typeof(a) <> 'object' then
    perform public.mentorship_fail('invalid_input', 'answers');
  end if;
  select * into m from public.mentorship_mentor where user_id = v_uid for update;
  if not found or m.status not in ('submitted', 'training_passed', 'approved', 'paused') then
    perform public.mentorship_fail('quiz_locked');
  end if;
  if m.quiz_passed_at is not null then
    perform public.mentorship_fail('already_passed');
  end if;
  if m.quiz_last_at is not null and m.quiz_last_at + make_interval(hours => v_cooldown) > now() then
    perform public.mentorship_fail('quiz_cooldown', to_char((m.quiz_last_at + make_interval(hours => v_cooldown)) at time zone 'UTC',
                                                            'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  end if;
  select count(*),
         count(*) filter (where a->>q.id is not distinct from q.correct_key),
         coalesce(jsonb_agg(q.id order by q.position, q.id) filter (where a->>q.id is distinct from q.correct_key), '[]'::jsonb),
         coalesce(jsonb_object_agg(q.id, coalesce(q.explanation, '')), '{}'::jsonb),
         coalesce(jsonb_object_agg(q.id, left(a->>q.id, 10)) filter (where a ? q.id), '{}'::jsonb)
    into v_total, v_correct, v_wrong, v_expl, v_clean
    from public.mentorship_quiz_question q where q.active;
  if v_total = 0 then
    perform public.mentorship_fail('quiz_locked', 'no_questions');
  end if;
  v_passed := v_correct * 100 >= v_pass * v_total;
  v_pct := round(v_correct * 100.0 / v_total)::int;
  insert into public.mentorship_quiz_attempt (mentor_id, user_id, answers, correct, total, score_pct, passed)
  values (m.id, v_uid, v_clean, v_correct, v_total, v_pct, v_passed);
  update public.mentorship_mentor
     set quiz_attempts = quiz_attempts + 1,
         quiz_best_pct = greatest(coalesce(quiz_best_pct, 0), v_pct),
         quiz_last_at = now(),
         quiz_passed_at = case when v_passed then now() else quiz_passed_at end,
         status = case when v_passed and status = 'submitted' then 'training_passed' else status end,
         status_changed_at = case when v_passed and status = 'submitted' then now() else status_changed_at end
   where id = m.id
  returning * into m;
  perform public.mentorship_log_event('quiz_attempt', m.id, null,
    jsonb_build_object('score_pct', v_pct, 'correct', v_correct, 'total', v_total, 'passed', v_passed));
  return jsonb_build_object(
    'score_pct', v_pct, 'correct', v_correct, 'total', v_total, 'passed', v_passed,
    'wrong_ids', v_wrong,
    'explanations', case when v_passed then v_expl else '{}'::jsonb end,
    'next_attempt_at', case when v_passed then null else now() + make_interval(hours => v_cooldown) end,
    'status', m.status);
end
$$;

create or replace function public.mentorship_my_mentees(p_include_closed boolean default false)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  m public.mentorship_mentor;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  select * into m from public.mentorship_mentor where user_id = v_uid;
  if not found or m.status not in ('approved', 'paused') then
    perform public.mentorship_fail('forbidden', 'mentor_status');
  end if;
  return coalesce((select jsonb_agg(public.mentorship_mentee_card(x.id)
                                    order by (x.status = 'active') desc, x.started_at desc)
                     from public.mentorship_match x
                    where x.mentor_id = m.id and (coalesce(p_include_closed, false) or x.status = 'active')), '[]'::jsonb);
end
$$;

-- The match, if the caller is its mentor (any mentor status), else null.
create or replace function public.mentorship_mentor_match(p_match_id uuid)
returns public.mentorship_match
language sql stable security definer
set search_path = public, pg_temp
as $$
  select x.* from public.mentorship_match x
    join public.mentorship_mentor mm on mm.id = x.mentor_id
   where x.id = p_match_id and mm.user_id = auth.uid()
$$;

create or replace function public.mentorship_set_checklist(p_match_id uuid, p_item text, p_done boolean, p_note text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  x public.mentorship_match;
  v_note text;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  x := public.mentorship_mentor_match(p_match_id);
  if x.id is null then
    perform public.mentorship_fail('not_found', 'match');
  end if;
  if x.status <> 'active' then
    perform public.mentorship_fail('match_not_active');
  end if;
  if p_item is null or not (p_item = any (public.mentorship_vocab('checklist_items'))) then
    perform public.mentorship_fail('invalid_input', 'item');
  end if;
  v_note := public.mentorship_txt(to_jsonb(p_note), 300, 'note');
  if coalesce(p_done, false) then
    insert into public.mentorship_checklist (match_id, item, note, updated_by)
    values (x.id, p_item, v_note, v_uid)
    on conflict (match_id, item) do update set note = coalesce(excluded.note, public.mentorship_checklist.note),
                                               updated_by = excluded.updated_by;
  else
    delete from public.mentorship_checklist c where c.match_id = x.id and c.item = p_item;
  end if;
  return jsonb_build_object('match_id', x.id,
    'checklist', coalesce((select jsonb_object_agg(c.item, jsonb_build_object('done_at', c.done_at, 'note', coalesce(c.note, '')))
                             from public.mentorship_checklist c where c.match_id = x.id), '{}'::jsonb));
end
$$;

create or replace function public.mentorship_log_call(p_match_id uuid, p_week_no int, p_called_on date, p_stage text,
                                                      p_applications int, p_interviews int default 0, p_notes text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  x public.mentorship_match;
  c public.mentorship_call_log;
  v_notes text;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  x := public.mentorship_mentor_match(p_match_id);
  if x.id is null then
    perform public.mentorship_fail('not_found', 'match');
  end if;
  if x.status <> 'active' then
    perform public.mentorship_fail('match_not_active');
  end if;
  if p_week_no is null or p_week_no < 1 or p_week_no > 60 then
    perform public.mentorship_fail('invalid_input', 'week_no');
  end if;
  if p_called_on is null or p_called_on > public.mentorship_ist_date(now())
     or p_called_on < public.mentorship_ist_date(x.started_at) then
    perform public.mentorship_fail('invalid_input', 'called_on');
  end if;
  if p_stage is null or not (p_stage = any (public.mentorship_vocab('hunt_stages'))) then
    perform public.mentorship_fail('invalid_input', 'stage');
  end if;
  if p_applications is null or p_applications < 0 or p_applications > 500 then
    perform public.mentorship_fail('invalid_input', 'applications');
  end if;
  if coalesce(p_interviews, 0) < 0 or coalesce(p_interviews, 0) > 100 then
    perform public.mentorship_fail('invalid_input', 'interviews');
  end if;
  v_notes := public.mentorship_txt(to_jsonb(p_notes), 1000, 'notes');
  insert into public.mentorship_call_log (match_id, week_no, called_on, hunt_stage, applications_count,
                                          interviews_count, notes, created_by)
  values (x.id, p_week_no, p_called_on, p_stage, p_applications, coalesce(p_interviews, 0), v_notes, v_uid)
  on conflict (match_id, week_no) do update
     set called_on = excluded.called_on, hunt_stage = excluded.hunt_stage,
         applications_count = excluded.applications_count, interviews_count = excluded.interviews_count,
         notes = excluded.notes
  returning * into c;
  return jsonb_build_object('id', c.id, 'match_id', c.match_id, 'week_no', c.week_no, 'called_on', c.called_on,
                            'hunt_stage', c.hunt_stage, 'applications_count', c.applications_count,
                            'interviews_count', c.interviews_count, 'notes', coalesce(c.notes, ''),
                            'created_at', c.created_at, 'updated_at', c.updated_at);
end
$$;

-- -----------------------------------------------------------------------------
-- 10. Student RPCs
-- -----------------------------------------------------------------------------

create or replace function public.mentorship_save_student(p_full_name text, p_whatsapp text, p_city text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_wa text;
  v_city text;
  v_email text;
  s public.mentorship_student;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  v_name := public.mentorship_name(to_jsonb(p_full_name), 'full_name');
  if v_name is null then
    perform public.mentorship_fail('invalid_input', 'full_name');
  end if;
  v_wa := public.mentorship_norm_phone(p_whatsapp);
  if v_wa is null then
    perform public.mentorship_fail('invalid_input', 'whatsapp');
  end if;
  v_city := public.mentorship_txt(to_jsonb(p_city), 40, 'city');
  v_email := public.mentorship_auth_email(v_uid);
  insert into public.mentorship_student (user_id, full_name, email, whatsapp, city)
  values (v_uid, v_name, v_email, v_wa, v_city)
  on conflict (user_id) do update
     set full_name = excluded.full_name, email = excluded.email, whatsapp = excluded.whatsapp, city = excluded.city
  returning * into s;
  return jsonb_build_object('full_name', s.full_name, 'whatsapp', s.whatsapp, 'city', s.city, 'email', s.email);
end
$$;

create or replace function public.mentorship_list_mentors(p_program text default 'industrial-training')
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_day text := public.mentorship_ist_date(now())::text;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  if p_program is null or not (p_program = any (public.mentorship_vocab('programs'))) then
    perform public.mentorship_fail('invalid_input', 'program');
  end if;
  return coalesce((
    select jsonb_agg(x.j order by (x.j->>'available')::boolean desc, md5(x.id::text || v_day))
      from (select mm.id, public.mentorship_public_mentor(mm) as j
              from public.mentorship_mentor mm
             where mm.status = 'approved' and p_program = any (mm.programs)) x), '[]'::jsonb);
end
$$;

create or replace function public.mentorship_mentor_public(p_mentor_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  mm public.mentorship_mentor;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  select * into mm from public.mentorship_mentor where id = p_mentor_id and status in ('approved', 'paused');
  if not found then
    perform public.mentorship_fail('not_found', 'mentor');
  end if;
  return jsonb_build_object(
    'mentor', public.mentorship_public_mentor(mm),
    'reviews', coalesce((select jsonb_agg(t.j order by t.created_at desc)
                           from (select public.mentorship_review_json(r) as j, r.created_at
                                   from public.mentorship_review r
                                  where r.mentor_id = mm.id and r.published
                                  order by r.created_at desc limit 30) t), '[]'::jsonb),
    'tag_counts', coalesce((select jsonb_object_agg(t.tag, t.n)
                              from (select x.tag, count(*) as n
                                      from public.mentorship_review r, unnest(r.tags) as x(tag)
                                     where r.mentor_id = mm.id and r.published
                                     group by x.tag) t), '{}'::jsonb));
end
$$;

create or replace function public.mentorship_book(p_mentor_id uuid, p_program text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s public.mentorship_student;
  mm public.mentorship_mentor;
  v_active int;
  v_id uuid;
  v_info jsonb;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  if p_program is null or not (p_program = any (public.mentorship_vocab('programs'))) then
    perform public.mentorship_fail('invalid_input', 'program');
  end if;
  if not (p_program = any (public.mentorship_enabled_programs())) then
    perform public.mentorship_fail('program_closed', p_program);
  end if;
  if not (p_program = any (public.mentorship_enrolled_programs(v_uid))) then
    perform public.mentorship_fail('not_enrolled', p_program);
  end if;
  select * into s from public.mentorship_student where user_id = v_uid;
  if not found or s.whatsapp is null then
    perform public.mentorship_fail('student_profile_missing');
  end if;
  if exists (select 1 from public.mentorship_match x
              where x.mentee_user_id = v_uid and x.program = p_program and x.status = 'active') then
    perform public.mentorship_fail('already_matched');
  end if;
  -- One mentorship per program: after a completed one (they joined) there is no new self-booking,
  -- and after one Team MSC ended early the next mentor is set up by Team MSC (admin assign).
  if exists (select 1 from public.mentorship_match x
              where x.mentee_user_id = v_uid and x.program = p_program and x.status = 'completed') then
    perform public.mentorship_fail('mentorship_completed', p_program);
  end if;
  if exists (select 1 from public.mentorship_match x
              where x.mentee_user_id = v_uid and x.program = p_program and x.status = 'ended') then
    perform public.mentorship_fail('mentorship_ended', p_program);
  end if;
  -- Lock the mentor row: concurrent bookings of the same mentor queue here, so the count is exact.
  select * into mm from public.mentorship_mentor where id = p_mentor_id for update;
  if not found then
    perform public.mentorship_fail('mentor_unavailable');
  end if;
  if mm.user_id = v_uid then
    perform public.mentorship_fail('cannot_book_self');
  end if;
  if mm.status <> 'approved' or not mm.accepting or not (p_program = any (mm.programs)) then
    perform public.mentorship_fail('mentor_unavailable');
  end if;
  select count(*) into v_active from public.mentorship_match x where x.mentor_id = mm.id and x.status = 'active';
  if v_active >= mm.max_mentees then
    perform public.mentorship_fail('mentor_full');
  end if;
  v_info := public.mentorship_enrollment_info(v_uid, p_program);
  begin
    insert into public.mentorship_match (program, mentor_id, mentee_user_id, status, source, batch, fee_inr, created_by)
    values (p_program, mm.id, v_uid, 'active', 'self', v_info->>'batch', public.mentorship_cfg_int('mentor_fee_inr'), v_uid)
    returning id into v_id;
  exception when unique_violation then
    perform public.mentorship_fail('already_matched');
  end;
  perform public.mentorship_log_event('match_created', mm.id, v_id,
    jsonb_build_object('program', p_program, 'source', 'self'));
  return public.mentorship_student_match(v_id);
end
$$;

create or replace function public.mentorship_my_match(p_program text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s public.mentorship_student;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  select * into s from public.mentorship_student where user_id = v_uid;
  return jsonb_build_object(
    'student', case when s.user_id is null then null else
                 jsonb_build_object('full_name', s.full_name, 'whatsapp', s.whatsapp, 'city', s.city,
                                    'email', coalesce(public.mentorship_auth_email(v_uid), s.email)) end,
    'matches', coalesce((select jsonb_agg(public.mentorship_student_match(x.id)
                                          order by (x.status = 'active') desc, x.started_at desc)
                           from public.mentorship_match x
                          where x.mentee_user_id = v_uid and (p_program is null or x.program = p_program)), '[]'::jsonb));
end
$$;

create or replace function public.mentorship_submit_pulse(p_match_id uuid, p_applications int, p_stage text,
                                                          p_mentor_called boolean, p_rating int, p_issue text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  x public.mentorship_match;
  r public.mentorship_pulse;
  v_issue text;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  select * into x from public.mentorship_match where id = p_match_id and mentee_user_id = v_uid;
  if not found then
    perform public.mentorship_fail('not_found', 'match');
  end if;
  if x.status <> 'active' then
    perform public.mentorship_fail('match_not_active');
  end if;
  if p_applications is null or p_applications < 0 or p_applications > 500 then
    perform public.mentorship_fail('invalid_input', 'applications');
  end if;
  if p_stage is null or not (p_stage = any (public.mentorship_vocab('hunt_stages'))) then
    perform public.mentorship_fail('invalid_input', 'stage');
  end if;
  if p_mentor_called is null then
    perform public.mentorship_fail('invalid_input', 'mentor_called');
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    perform public.mentorship_fail('invalid_input', 'rating');
  end if;
  v_issue := public.mentorship_txt(to_jsonb(p_issue), 1000, 'issue');
  insert into public.mentorship_pulse (match_id, mentee_user_id, week_start, applications_count, hunt_stage,
                                       mentor_called, rating, issue)
  values (x.id, v_uid, public.mentorship_ist_week_start(now()), p_applications, p_stage, p_mentor_called, p_rating, v_issue)
  on conflict (match_id, week_start) do update
     set applications_count = excluded.applications_count, hunt_stage = excluded.hunt_stage,
         mentor_called = excluded.mentor_called, rating = excluded.rating, issue = excluded.issue
  returning * into r;
  return to_jsonb(r) || jsonb_build_object('issue', coalesce(r.issue, ''));
end
$$;

create or replace function public.mentorship_submit_review(p_match_id uuid, p_rating int, p_tags text[] default '{}',
                                                           p_body text default null, p_safety_flag boolean default false,
                                                           p_private_note text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  x public.mentorship_match;
  r public.mentorship_review;
  v_eligible timestamptz;
  v_tags text[];
  v_body text;
  v_note text;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  select * into x from public.mentorship_match where id = p_match_id and mentee_user_id = v_uid;
  if not found then
    perform public.mentorship_fail('not_found', 'match');
  end if;
  v_eligible := x.started_at + make_interval(days => public.mentorship_cfg_int('review_after_days'));
  if now() < v_eligible then
    perform public.mentorship_fail('review_too_early', to_char(v_eligible at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    perform public.mentorship_fail('invalid_input', 'rating');
  end if;
  v_tags := public.mentorship_list(to_jsonb(coalesce(p_tags, '{}'::text[])), 'review_tags', 3, 40, 'tags');
  v_body := public.mentorship_txt(to_jsonb(p_body), 600, 'body');
  v_note := public.mentorship_txt(to_jsonb(p_private_note), 1000, 'private_note');
  insert into public.mentorship_review (match_id, mentor_id, mentee_user_id, rating, tags, body, safety_flag, private_note)
  values (x.id, x.mentor_id, v_uid, p_rating, v_tags, v_body, coalesce(p_safety_flag, false), v_note)
  on conflict (match_id) do update
     set rating = excluded.rating, tags = excluded.tags, body = excluded.body,
         safety_flag = excluded.safety_flag, private_note = excluded.private_note
  returning * into r;
  return to_jsonb(r) || jsonb_build_object('body', coalesce(r.body, ''));
end
$$;

create or replace function public.mentorship_request_switch(p_match_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  x public.mentorship_match;
  r public.mentorship_switch_request;
  v_reason text;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  select * into x from public.mentorship_match where id = p_match_id and mentee_user_id = v_uid for update;
  if not found then
    perform public.mentorship_fail('not_found', 'match');
  end if;
  if x.status <> 'active' then
    perform public.mentorship_fail('match_not_active');
  end if;
  if exists (select 1 from public.mentorship_switch_request s
              where s.mentee_user_id = v_uid and s.program = x.program and s.status = 'pending') then
    perform public.mentorship_fail('switch_pending');
  end if;
  if (select count(*) from public.mentorship_switch_request s
       where s.mentee_user_id = v_uid and s.program = x.program and s.status <> 'withdrawn')
     >= public.mentorship_cfg_int('switch_limit') then
    perform public.mentorship_fail('switch_used');
  end if;
  v_reason := public.mentorship_txt(to_jsonb(p_reason), 600, 'reason');
  if v_reason is null or char_length(v_reason) < 20 then
    perform public.mentorship_fail('invalid_input', 'reason');
  end if;
  insert into public.mentorship_switch_request (match_id, mentee_user_id, program, reason)
  values (x.id, v_uid, x.program, v_reason)
  returning * into r;
  perform public.mentorship_log_event('switch_requested', x.mentor_id, x.id, jsonb_build_object('request_id', r.id));
  return jsonb_build_object('id', r.id, 'match_id', r.match_id, 'program', r.program, 'status', r.status,
                            'reason', r.reason, 'created_at', r.created_at, 'resolution_note', r.resolution_note,
                            'resolved_at', r.resolved_at);
end
$$;

-- -----------------------------------------------------------------------------
-- 11. Staff: lists, red flags, overview (read: any active staff)
-- -----------------------------------------------------------------------------

-- Enrolled students of a program with no active (or completed) match. Enrollments before
-- config.unmatched_since are ignored unless the student has filled the booking form.
create or replace function public.mentorship_unmatched_list(p_program text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz;
  v_today date := public.mentorship_ist_date(now());
  -- Without an enrollment.created_at column the date cutoff cannot apply, so every enrollment counts.
  v_dated boolean := public.mentorship_col_exists('public.enrollment', 'created_at');
begin
  begin
    v_since := public.mentorship_ist_midnight((public.mentorship_cfg('unmatched_since') #>> '{}')::date);
  exception when others then
    v_since := public.mentorship_ist_midnight(date '2026-10-01');
  end;
  return coalesce((
    with en as (
      select e.user_id, e.enrolled_at, e.batch from public.mentorship_enrollment_users(p_program) e
    ),
    cand as (
      select en.user_id, en.enrolled_at, en.batch, s.user_id is not null as has_student_row, s.created_at as student_created_at
        from en
        left join public.mentorship_student s on s.user_id = en.user_id
       where (not v_dated or en.enrolled_at >= v_since or s.user_id is not null)
         and not exists (select 1 from public.mentorship_match x
                          where x.mentee_user_id = en.user_id and x.program = p_program
                            and x.status in ('active', 'completed'))
    ),
    w as (
      select c.*, case when c.enrolled_at >= v_since then c.enrolled_at else c.student_created_at end as waiting_since,
             public.mentorship_person(c.user_id) as person
        from cand c
    )
    select jsonb_agg(jsonb_build_object(
             'user_id', w.user_id, 'email', w.person->>'email', 'name', w.person->>'full_name',
             'whatsapp', w.person->>'whatsapp', 'city', w.person->>'city', 'enrolled_at', w.enrolled_at,
             'batch', w.batch,
             'days_waiting', case when w.waiting_since is not null then v_today - public.mentorship_ist_date(w.waiting_since) end,
             'has_student_row', w.has_student_row, 'waiting_since', w.waiting_since, 'program', p_program)
           order by w.waiting_since asc nulls last)
      from w), '[]'::jsonb);
end
$$;

create or replace function public.mentorship_red_flags_list()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.mentorship_ist_date(now());
  v_call_days int := public.mentorship_cfg_int('red_flag_call_days');
  v_wait_days int := public.mentorship_cfg_int('unmatched_after_days');
  v_unmatched jsonb := '[]'::jsonb;
  v_prog text;
  v_out jsonb;
begin
  foreach v_prog in array public.mentorship_enabled_programs() loop
    v_unmatched := v_unmatched || public.mentorship_unmatched_list(v_prog);
  end loop;

  with am as (
    select x.id, x.mentor_id, x.mentee_user_id, x.program, x.started_at,
           public.mentorship_ist_date(x.started_at) as start_day, mm.full_name as mentor_name,
           public.mentorship_person(x.mentee_user_id)->>'whatsapp' is null as no_contact
      from public.mentorship_match x
      join public.mentorship_mentor mm on mm.id = x.mentor_id
     where x.status = 'active'
  ),
  lastcall as (
    select distinct on (c.match_id) c.match_id, c.called_on, c.week_no
      from public.mentorship_call_log c
      join am on am.id = c.match_id
     order by c.match_id, c.called_on desc, c.week_no desc
  ),
  f as (
    select 'intro_late'::text as kind, 'high'::text as severity, am.id as match_id, am.mentor_id, am.mentor_name,
           am.mentee_user_id, am.program,
           format('Matched %s, intro not marked sent.',
                  case when v_today - am.start_day <= 1 then 'over a day ago' else (v_today - am.start_day) || ' days ago' end) as detail,
           am.started_at + interval '24 hours' as since
      from am
     where now() - am.started_at > interval '24 hours' and not am.no_contact
       and not exists (select 1 from public.mentorship_checklist c where c.match_id = am.id and c.item = 'intro_sent')
    union all
    -- An assigned mentee with no WhatsApp anywhere: the mentor cannot send the intro yet.
    select 'mentee_no_contact', 'high', am.id, am.mentor_id, am.mentor_name, am.mentee_user_id, am.program,
           'No WhatsApp number for this mentee, so the mentor cannot send the intro. Ask the student to add it on My mentor.',
           am.started_at
      from am
     where am.no_contact
    union all
    select 'no_call_8d', case when v_today - coalesce(lc.called_on, am.start_day) >= 14 then 'high' else 'medium' end,
           am.id, am.mentor_id, am.mentor_name, am.mentee_user_id, am.program,
           case when lc.called_on is null
                then format('No weekly call logged since the match started %s days ago.', v_today - am.start_day)
                else format('Last call logged %s days ago (week %s).', v_today - lc.called_on, lc.week_no) end,
           coalesce(public.mentorship_ist_midnight(lc.called_on), am.started_at)
      from am
      left join lastcall lc on lc.match_id = am.id
     where v_today - am.start_day >= v_call_days
       and (lc.called_on is null or lc.called_on <= v_today - v_call_days)
    union all
    select * from (
      select distinct on (p.match_id) 'mentor_not_calling'::text, 'high'::text, am.id, am.mentor_id, am.mentor_name,
             am.mentee_user_id, am.program,
             format('Mentee said the mentor did not call in the week of %s.', to_char(p.week_start, 'FMDD Mon')),
             p.updated_at
        from am
        join public.mentorship_pulse p on p.match_id = am.id
       where p.mentor_called = false and p.updated_at >= now() - interval '14 days'
       order by p.match_id, p.updated_at desc) nc
    union all
    select 'low_rating', case when lp.rating <= 2 then 'high' else 'medium' end,
           am.id, am.mentor_id, am.mentor_name, am.mentee_user_id, am.program,
           format('Latest weekly pulse rating %s/5.', lp.rating), lp.updated_at
      from am
      join lateral (select p.rating, p.updated_at from public.mentorship_pulse p
                     where p.match_id = am.id order by p.week_start desc, p.updated_at desc limit 1) lp on true
     where lp.updated_at >= now() - interval '21 days' and lp.rating < 4
    union all
    select 'no_applications_2w', 'medium', am.id, am.mentor_id, am.mentor_name, am.mentee_user_id, am.program,
           'No applications reported in the last 2 weeks.', now() - interval '14 days'
      from am
      left join lateral (select st.stage from (
                           select c.hunt_stage as stage, public.mentorship_ist_midnight(c.called_on) as at
                             from public.mentorship_call_log c where c.match_id = am.id
                           union all
                           select p.hunt_stage, p.updated_at from public.mentorship_pulse p where p.match_id = am.id) st
                          where st.stage is not null order by st.at desc limit 1) ls on true
     where v_today - am.start_day >= 14
       and coalesce(ls.stage, '') not in ('offer', 'joined', 'on_hold')
       and not exists (select 1 from public.mentorship_call_log c
                        where c.match_id = am.id and c.called_on >= v_today - 14 and c.applications_count > 0)
       and not exists (select 1 from public.mentorship_pulse p
                        where p.match_id = am.id and p.updated_at >= now() - interval '14 days' and p.applications_count > 0)
    union all
    select * from (
      select distinct on (p.match_id) 'pulse_issue'::text, 'medium'::text, am.id, am.mentor_id, am.mentor_name,
             am.mentee_user_id, am.program, left(btrim(p.issue), 140), p.updated_at
        from am
        join public.mentorship_pulse p on p.match_id = am.id
       where nullif(btrim(p.issue), '') is not null and p.updated_at >= now() - interval '14 days'
       order by p.match_id, p.updated_at desc) pi
    union all
    select 'safety_flag', 'high', x.id, x.mentor_id, mm.full_name, x.mentee_user_id, x.program,
           'Review says the mentor asked for money, sold a course or promised a job.'
             || coalesce(' Note: ' || left(nullif(btrim(r.private_note), ''), 120), ''),
           r.updated_at
      from public.mentorship_review r
      join public.mentorship_match x on x.id = r.match_id
      join public.mentorship_mentor mm on mm.id = x.mentor_id
     where r.safety_flag and r.updated_at >= now() - interval '60 days'
    union all
    select 'switch_pending', 'medium', x.id, x.mentor_id, mm.full_name, sr.mentee_user_id, sr.program,
           left(sr.reason, 140), sr.created_at
      from public.mentorship_switch_request sr
      join public.mentorship_match x on x.id = sr.match_id
      join public.mentorship_mentor mm on mm.id = x.mentor_id
     where sr.status = 'pending'
    union all
    select 'unmatched', case when (u->>'days_waiting')::int >= 7 then 'high' else 'medium' end,
           null::uuid, null::uuid, null::text, (u->>'user_id')::uuid, u->>'program',
           format('Enrolled, no mentor yet (waiting %s days).', u->>'days_waiting'),
           (u->>'waiting_since')::timestamptz
      from jsonb_array_elements(v_unmatched) u
     where u->>'days_waiting' is not null and (u->>'days_waiting')::int >= v_wait_days
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', f.kind, 'severity', f.severity, 'match_id', f.match_id, 'mentor_id', f.mentor_id,
           'mentor_name', f.mentor_name, 'mentee_user_id', f.mentee_user_id,
           'mentee_name', public.mentorship_person(f.mentee_user_id)->>'full_name',
           'program', f.program, 'detail', f.detail, 'since', f.since)
         order by case f.severity when 'high' then 0 else 1 end, f.since asc nulls last, f.kind), '[]'::jsonb)
    into v_out
    from f;
  return v_out;
end
$$;

create or replace function public.mentorship_admin_red_flags()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mentorship_require_staff();
  return public.mentorship_red_flags_list();
end
$$;

create or replace function public.mentorship_admin_overview()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_flags jsonb;
  v_unmatched int := 0;
  v_prog text;
begin
  perform public.mentorship_require_staff();
  v_flags := public.mentorship_red_flags_list();
  foreach v_prog in array public.mentorship_enabled_programs() loop
    v_unmatched := v_unmatched + jsonb_array_length(public.mentorship_unmatched_list(v_prog));
  end loop;
  return jsonb_build_object(
    'counts', jsonb_build_object(
      'mentors', (select jsonb_object_agg(st, coalesce(c.n, 0))
                    from unnest(public.mentorship_vocab('mentor_status')) st
                    left join (select mm.status, count(*) as n from public.mentorship_mentor mm group by mm.status) c
                      on c.status = st),
      'active_matches', (select count(*) from public.mentorship_match x where x.status = 'active'),
      'matches_by_program', coalesce((select jsonb_object_agg(x.program, x.n)
                                        from (select program, count(*) as n from public.mentorship_match
                                               where status = 'active' group by program) x), '{}'::jsonb),
      'unmatched', v_unmatched,
      'red_flags', jsonb_build_object(
        'high', (select count(*) from jsonb_array_elements(v_flags) e where e->>'severity' = 'high'),
        'medium', (select count(*) from jsonb_array_elements(v_flags) e where e->>'severity' = 'medium')),
      'switch_pending', (select count(*) from public.mentorship_switch_request s where s.status = 'pending'),
      'payouts', (select jsonb_build_object(
                    'unpaid_inr', coalesce(sum(x.fee_inr) filter (where x.payout_status = 'unpaid'), 0),
                    'due_inr', coalesce(sum(x.fee_inr) filter (where x.payout_status = 'due'), 0),
                    'paid_inr', coalesce(sum(x.fee_inr) filter (where x.payout_status = 'paid'), 0),
                    'due_count', count(*) filter (where x.payout_status = 'due'))
                    from public.mentorship_match x)),
    'generated_at', now());
end
$$;

create or replace function public.mentorship_admin_mentors(p_status text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mentorship_require_staff();
  if p_status is not null and not (p_status = any (public.mentorship_vocab('mentor_status'))) then
    perform public.mentorship_fail('invalid_input', 'status');
  end if;
  return coalesce((select jsonb_agg(public.mentorship_admin_mentor_json(mm)
                                    order by coalesce(mm.submitted_at, mm.created_at) desc)
                     from public.mentorship_mentor mm
                    where p_status is null or mm.status = p_status), '[]'::jsonb);
end
$$;

create or replace function public.mentorship_admin_mentor_detail(p_mentor_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  mm public.mentorship_mentor;
  j jsonb;
begin
  perform public.mentorship_require_staff();
  select * into mm from public.mentorship_mentor where id = p_mentor_id;
  if not found then
    perform public.mentorship_fail('not_found', 'mentor');
  end if;
  j := public.mentorship_admin_mentor_json(mm);
  return jsonb_build_object(
    'mentor', j,
    'active_count', j->'active_count',
    'quiz_attempts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'score_pct', a.score_pct, 'correct', a.correct,
                                                                   'total', a.total, 'passed', a.passed, 'created_at', a.created_at)
                                                order by a.created_at desc)
                                 from public.mentorship_quiz_attempt a where a.mentor_id = mm.id), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(public.mentorship_admin_match_json(x.id)
                                          order by (x.status = 'active') desc, x.started_at desc)
                           from public.mentorship_match x where x.mentor_id = mm.id), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(public.mentorship_review_json(r, true)
                                          order by r.safety_flag desc, r.created_at desc)
                           from public.mentorship_review r where r.mentor_id = mm.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind,
                                                            'actor_name', public.mentorship_actor_name(e.actor_id),
                                                            'match_id', e.match_id, 'detail', e.detail,
                                                            'created_at', e.created_at)
                                         order by e.created_at desc, e.id desc)
                          from (select * from public.mentorship_event ev where ev.mentor_id = mm.id
                                 order by ev.created_at desc, ev.id desc limit 100) e), '[]'::jsonb));
end
$$;

create or replace function public.mentorship_admin_matches(p_status text default 'active', p_program text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mentorship_require_staff();
  if p_status is not null and not (p_status = any (public.mentorship_vocab('match_status'))) then
    perform public.mentorship_fail('invalid_input', 'status');
  end if;
  if p_program is not null and not (p_program = any (public.mentorship_vocab('programs'))) then
    perform public.mentorship_fail('invalid_input', 'program');
  end if;
  return coalesce((select jsonb_agg(public.mentorship_admin_match_json(x.id) order by x.started_at desc)
                     from public.mentorship_match x
                    where (p_status is null or x.status = p_status)
                      and (p_program is null or x.program = p_program)), '[]'::jsonb);
end
$$;

create or replace function public.mentorship_admin_unmatched(p_program text default 'industrial-training')
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mentorship_require_staff();
  if p_program is null or not (p_program = any (public.mentorship_vocab('programs'))) then
    perform public.mentorship_fail('invalid_input', 'program');
  end if;
  return public.mentorship_unmatched_list(p_program);
end
$$;

create or replace function public.mentorship_switch_json(p_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'id', s.id, 'match_id', s.match_id, 'program', s.program, 'status', s.status, 'reason', s.reason,
           'created_at', s.created_at,
           'mentee', jsonb_build_object('user_id', s.mentee_user_id,
                                        'full_name', public.mentorship_person(s.mentee_user_id)->>'full_name',
                                        'whatsapp', public.mentorship_person(s.mentee_user_id)->>'whatsapp'),
           'mentor', jsonb_build_object('id', mm.id, 'full_name', mm.full_name),
           'resolution_note', s.resolution_note, 'resolved_at', s.resolved_at, 'new_match_id', s.new_match_id)
    from public.mentorship_switch_request s
    join public.mentorship_match x on x.id = s.match_id
    join public.mentorship_mentor mm on mm.id = x.mentor_id
   where s.id = p_id
$$;

create or replace function public.mentorship_admin_switch_requests(p_status text default 'pending')
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mentorship_require_staff();
  if p_status is not null and not (p_status = any (public.mentorship_vocab('switch_status'))) then
    perform public.mentorship_fail('invalid_input', 'status');
  end if;
  return coalesce((select jsonb_agg(public.mentorship_switch_json(s.id) order by s.created_at desc)
                     from public.mentorship_switch_request s
                    where p_status is null or s.status = p_status), '[]'::jsonb);
end
$$;

create or replace function public.mentorship_admin_reviews(p_mentor_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mentorship_require_staff();
  return coalesce((select jsonb_agg(public.mentorship_review_json(r, true) order by r.safety_flag desc, r.created_at desc)
                     from public.mentorship_review r
                    where p_mentor_id is null or r.mentor_id = p_mentor_id), '[]'::jsonb);
end
$$;

create or replace function public.mentorship_staff_json(p_uid uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('user_id', s.user_id, 'email', coalesce(public.mentorship_auth_email(s.user_id), s.email),
                            'name', s.name, 'role', s.role, 'whatsapp', s.whatsapp, 'active', s.active,
                            'created_at', s.created_at, 'updated_at', s.updated_at)
    from public.mentorship_staff s where s.user_id = p_uid
$$;

create or replace function public.mentorship_admin_staff()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mentorship_require_staff();
  return coalesce((select jsonb_agg(public.mentorship_staff_json(s.user_id)
                                    order by s.active desc, s.role, s.created_at)
                     from public.mentorship_staff s), '[]'::jsonb);
end
$$;

create or replace function public.mentorship_admin_get_config()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mentorship_require_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('key', c.key, 'value', c.value, 'is_public', c.is_public,
                                                       'note', c.note, 'updated_at', c.updated_at) order by c.key)
                     from public.mentorship_config c), '[]'::jsonb);
end
$$;

-- -----------------------------------------------------------------------------
-- 12. Staff writes (admin role, except the staff note)
-- -----------------------------------------------------------------------------

create or replace function public.mentorship_admin_set_status(p_mentor_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  mm public.mentorship_mentor;
  v_from text;
  v_reason text;
begin
  v_uid := public.mentorship_require_staff('admin');
  if p_status is null or not (p_status = any (public.mentorship_vocab('mentor_status'))) then
    perform public.mentorship_fail('invalid_input', 'status');
  end if;
  select * into mm from public.mentorship_mentor where id = p_mentor_id for update;
  if not found then
    perform public.mentorship_fail('not_found', 'mentor');
  end if;
  if mm.status = p_status then
    return public.mentorship_admin_mentor_json(mm);
  end if;
  v_from := mm.status;
  v_reason := public.mentorship_txt(to_jsonb(p_reason), 500, 'reason');
  if p_status = 'approved' then
    if mm.quiz_passed_at is null then
      perform public.mentorship_fail('quiz_not_passed');
    end if;
    if mm.status not in ('training_passed', 'paused', 'rejected') then
      perform public.mentorship_fail('invalid_transition', 'from_' || mm.status);
    end if;
    -- Staff read what mentees tell Team MSC in confidence, so an active staff member is never a live mentor.
    if exists (select 1 from public.mentorship_staff s where s.user_id = mm.user_id and s.active) then
      perform public.mentorship_fail('invalid_transition', 'is_staff');
    end if;
    update public.mentorship_mentor
       set status = 'approved', approved_at = coalesce(approved_at, now()), approved_by = v_uid,
           status_changed_at = now()
     where id = mm.id
    returning * into mm;
  elsif p_status = 'rejected' then
    if mm.status not in ('submitted', 'training_passed', 'approved', 'paused') then
      perform public.mentorship_fail('invalid_transition', 'from_' || mm.status);
    end if;
    if v_reason is null then
      perform public.mentorship_fail('invalid_input', 'reason');
    end if;
    if exists (select 1 from public.mentorship_match x where x.mentor_id = mm.id and x.status = 'active') then
      perform public.mentorship_fail('invalid_transition', 'has_active_mentees');
    end if;
    update public.mentorship_mentor
       set status = 'rejected', rejected_at = now(), reject_reason = v_reason,
           reapply_after = public.mentorship_ist_date(now()) + 30, status_changed_at = now()
     where id = mm.id
    returning * into mm;
  elsif p_status = 'paused' then
    if mm.status <> 'approved' then
      perform public.mentorship_fail('invalid_transition', 'from_' || mm.status);
    end if;
    if v_reason is null then
      perform public.mentorship_fail('invalid_input', 'reason');
    end if;
    update public.mentorship_mentor
       set status = 'paused', paused_at = now(), pause_reason = v_reason, status_changed_at = now()
     where id = mm.id
    returning * into mm;
  else
    perform public.mentorship_fail('invalid_transition', 'to_' || p_status);
  end if;
  perform public.mentorship_log_event('status_changed', mm.id, null,
    jsonb_build_object('from', v_from, 'to', mm.status, 'reason', v_reason));
  return public.mentorship_admin_mentor_json(mm);
end
$$;

create or replace function public.mentorship_admin_update_mentor(p_mentor_id uuid, p_patch jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  p jsonb := coalesce(p_patch, '{}'::jsonb);
  mm public.mentorship_mentor;
  v_admin boolean;
  v_int int;
  v_sid uuid;
  v_active int;
begin
  v_uid := public.mentorship_require_staff();
  v_admin := public.mentorship_is_staff('admin');
  if jsonb_typeof(p) <> 'object' then
    perform public.mentorship_fail('invalid_input', 'patch');
  end if;
  p := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(p) e
         where e.key in ('linkedin_checked', 'topmate_checked', 'staff_note', 'senior_mentor_id', 'max_mentees'));
  if not v_admin and exists (select 1 from jsonb_object_keys(p) k where k <> 'staff_note') then
    perform public.mentorship_fail('forbidden', 'admin');
  end if;
  select * into mm from public.mentorship_mentor where id = p_mentor_id for update;
  if not found then
    perform public.mentorship_fail('not_found', 'mentor');
  end if;
  if p ? 'linkedin_checked' then
    mm.linkedin_checked := coalesce(public.mentorship_bool(p->'linkedin_checked', 'linkedin_checked'), false);
  end if;
  if p ? 'topmate_checked' then
    mm.topmate_checked := coalesce(public.mentorship_bool(p->'topmate_checked', 'topmate_checked'), false);
  end if;
  if p ? 'staff_note' then
    mm.staff_note := public.mentorship_txt(p->'staff_note', 2000, 'staff_note');
  end if;
  if p ? 'senior_mentor_id' then
    v_sid := public.mentorship_safe_uuid(p->>'senior_mentor_id');
    if p->>'senior_mentor_id' is not null and btrim(p->>'senior_mentor_id') <> '' then
      if v_sid is null or not exists (select 1 from public.mentorship_staff s where s.user_id = v_sid and s.active) then
        perform public.mentorship_fail('invalid_input', 'senior_mentor_id');
      end if;
    end if;
    mm.senior_mentor_id := v_sid;
  end if;
  if p ? 'max_mentees' then
    v_int := public.mentorship_int(p->'max_mentees', 1, public.mentorship_cfg_int('max_mentees_cap'), 'max_mentees');
    if v_int is not null then
      select count(*) into v_active from public.mentorship_match x where x.mentor_id = mm.id and x.status = 'active';
      if v_int < v_active then
        perform public.mentorship_fail('invalid_input', 'max_mentees_below_active');
      end if;
      mm.max_mentees := v_int;
    end if;
  end if;
  update public.mentorship_mentor
     set linkedin_checked = mm.linkedin_checked, topmate_checked = mm.topmate_checked, staff_note = mm.staff_note,
         senior_mentor_id = mm.senior_mentor_id, max_mentees = mm.max_mentees
   where id = mm.id
  returning * into mm;
  perform public.mentorship_log_event('mentor_updated_by_staff', mm.id, null,
    jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p) k)));
  return public.mentorship_admin_mentor_json(mm);
end
$$;

-- Shared by create_match / reassign: lock the mentor and check that it can take this mentee.
create or replace function public.mentorship_lock_mentor_for(p_mentor_id uuid, p_mentee uuid, p_program text, p_force boolean)
returns public.mentorship_mentor
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  mm public.mentorship_mentor;
  v_active int;
begin
  select * into mm from public.mentorship_mentor where id = p_mentor_id for update;
  if not found then
    perform public.mentorship_fail('not_found', 'mentor');
  end if;
  if mm.user_id = p_mentee then
    perform public.mentorship_fail('cannot_book_self');
  end if;
  if mm.status <> 'approved' or not (p_program = any (mm.programs)) then
    perform public.mentorship_fail('mentor_unavailable');
  end if;
  if not coalesce(p_force, false) then
    if not mm.accepting then
      perform public.mentorship_fail('mentor_unavailable');
    end if;
    select count(*) into v_active from public.mentorship_match x where x.mentor_id = mm.id and x.status = 'active';
    if v_active >= mm.max_mentees then
      perform public.mentorship_fail('mentor_full');
    end if;
  end if;
  return mm;
end
$$;

create or replace function public.mentorship_admin_create_match(p_mentee_user_id uuid, p_mentor_id uuid, p_program text,
                                                                p_force boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  mm public.mentorship_mentor;
  v_person jsonb;
  v_id uuid;
  v_info jsonb;
begin
  v_uid := public.mentorship_require_staff('admin');
  if p_program is null or not (p_program = any (public.mentorship_vocab('programs'))) then
    perform public.mentorship_fail('invalid_input', 'program');
  end if;
  if p_mentee_user_id is null or not exists (select 1 from auth.users u where u.id = p_mentee_user_id) then
    perform public.mentorship_fail('not_found', 'mentee');
  end if;
  if exists (select 1 from public.mentorship_match x
              where x.mentee_user_id = p_mentee_user_id and x.program = p_program and x.status = 'active') then
    perform public.mentorship_fail('already_matched');
  end if;
  mm := public.mentorship_lock_mentor_for(p_mentor_id, p_mentee_user_id, p_program, p_force);
  if not exists (select 1 from public.mentorship_student s where s.user_id = p_mentee_user_id) then
    v_person := public.mentorship_person(p_mentee_user_id);
    insert into public.mentorship_student (user_id, full_name, email, whatsapp, city)
    values (p_mentee_user_id, left(v_person->>'full_name', 80), v_person->>'email', v_person->>'whatsapp',
            left(v_person->>'city', 40))
    on conflict (user_id) do nothing;
  end if;
  v_info := public.mentorship_enrollment_info(p_mentee_user_id, p_program);
  begin
    insert into public.mentorship_match (program, mentor_id, mentee_user_id, status, source, batch, fee_inr, created_by)
    values (p_program, mm.id, p_mentee_user_id, 'active', 'admin', v_info->>'batch',
            public.mentorship_cfg_int('mentor_fee_inr'), v_uid)
    returning id into v_id;
  exception when unique_violation then
    perform public.mentorship_fail('already_matched');
  end;
  perform public.mentorship_log_event('match_created', mm.id, v_id,
    jsonb_build_object('program', p_program, 'source', 'admin', 'forced', coalesce(p_force, false)));
  return public.mentorship_admin_match_json(v_id);
end
$$;

-- Old match -> switched, new active match with the new mentor, pending switch request resolved.
create or replace function public.mentorship_reassign_internal(p_match_id uuid, p_new_mentor_id uuid, p_reason text,
                                                               p_force boolean, p_note text default null)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  x public.mentorship_match;
  mm public.mentorship_mentor;
  v_id uuid;
  v_reason text := coalesce(public.mentorship_txt(to_jsonb(p_reason), 500, 'reason'), 'Reassigned by Team MSC');
begin
  select * into x from public.mentorship_match where id = p_match_id for update;
  if not found then
    perform public.mentorship_fail('not_found', 'match');
  end if;
  if x.status <> 'active' then
    perform public.mentorship_fail('match_not_active');
  end if;
  if p_new_mentor_id is null then
    perform public.mentorship_fail('invalid_input', 'new_mentor_id');
  end if;
  if p_new_mentor_id = x.mentor_id then
    perform public.mentorship_fail('invalid_input', 'same_mentor');
  end if;
  mm := public.mentorship_lock_mentor_for(p_new_mentor_id, x.mentee_user_id, x.program, p_force);
  update public.mentorship_match
     set status = 'switched', ended_at = now(), end_reason = v_reason, ended_by = v_uid
   where id = x.id;
  insert into public.mentorship_match (program, mentor_id, mentee_user_id, status, source, previous_match_id, batch,
                                       fee_inr, created_by)
  values (x.program, mm.id, x.mentee_user_id, 'active', 'switch', x.id, x.batch,
          public.mentorship_cfg_int('mentor_fee_inr'), v_uid)
  returning id into v_id;
  update public.mentorship_switch_request
     set status = 'approved', new_match_id = v_id, resolved_by = v_uid, resolved_at = now(),
         resolution_note = left(coalesce(nullif(btrim(p_note), ''), v_reason), 600)
   where match_id = x.id and status = 'pending';
  perform public.mentorship_log_event('match_reassigned', x.mentor_id, x.id,
    jsonb_build_object('new_match_id', v_id, 'new_mentor_id', mm.id, 'reason', v_reason,
                       'forced', coalesce(p_force, false)));
  perform public.mentorship_log_event('match_created', mm.id, v_id,
    jsonb_build_object('program', x.program, 'source', 'switch', 'previous_match_id', x.id));
  return v_id;
end
$$;

create or replace function public.mentorship_admin_reassign(p_match_id uuid, p_new_mentor_id uuid, p_reason text,
                                                            p_force boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform public.mentorship_require_staff('admin');
  v_id := public.mentorship_reassign_internal(p_match_id, p_new_mentor_id, p_reason, p_force);
  return public.mentorship_admin_match_json(v_id);
end
$$;

create or replace function public.mentorship_admin_end_match(p_match_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  x public.mentorship_match;
  v_reason text;
begin
  v_uid := public.mentorship_require_staff('admin');
  if p_status is null or p_status not in ('completed', 'ended') then
    perform public.mentorship_fail('invalid_input', 'status');
  end if;
  v_reason := public.mentorship_txt(to_jsonb(p_reason), 500, 'reason');
  select * into x from public.mentorship_match where id = p_match_id for update;
  if not found then
    perform public.mentorship_fail('not_found', 'match');
  end if;
  if x.status <> 'active' then
    perform public.mentorship_fail('match_not_active');
  end if;
  update public.mentorship_match
     set status = p_status, ended_at = now(), end_reason = v_reason, ended_by = v_uid
   where id = x.id;
  update public.mentorship_switch_request
     set status = 'withdrawn', resolved_by = v_uid, resolved_at = now(),
         resolution_note = left('Mentorship ' || p_status || coalesce(': ' || v_reason, ''), 600)
   where match_id = x.id and status = 'pending';
  perform public.mentorship_log_event('match_ended', x.mentor_id, x.id,
    jsonb_build_object('status', p_status, 'reason', v_reason));
  return public.mentorship_admin_match_json(x.id);
end
$$;

create or replace function public.mentorship_admin_resolve_switch(p_request_id uuid, p_approve boolean,
                                                                  p_new_mentor_id uuid default null, p_note text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  r public.mentorship_switch_request;
  x public.mentorship_match;
  v_note text;
begin
  v_uid := public.mentorship_require_staff('admin');
  if p_approve is null then
    perform public.mentorship_fail('invalid_input', 'approve');
  end if;
  v_note := public.mentorship_txt(to_jsonb(p_note), 600, 'note');
  select * into r from public.mentorship_switch_request where id = p_request_id for update;
  if not found then
    perform public.mentorship_fail('not_found', 'switch_request');
  end if;
  if r.status <> 'pending' then
    perform public.mentorship_fail('invalid_transition', 'not_pending');
  end if;
  select * into x from public.mentorship_match where id = r.match_id;
  if p_approve then
    if p_new_mentor_id is null then
      perform public.mentorship_fail('invalid_input', 'new_mentor_id');
    end if;
    perform public.mentorship_reassign_internal(r.match_id, p_new_mentor_id,
                                                coalesce(v_note, 'Switch request approved'), false, v_note);
  else
    update public.mentorship_switch_request
       set status = 'declined', resolution_note = v_note, resolved_by = v_uid, resolved_at = now()
     where id = r.id;
  end if;
  select * into r from public.mentorship_switch_request where id = p_request_id;
  perform public.mentorship_log_event('switch_resolved', x.mentor_id, r.match_id,
    jsonb_build_object('request_id', r.id, 'status', r.status, 'new_match_id', r.new_match_id));
  return jsonb_build_object('id', r.id, 'match_id', r.match_id, 'program', r.program, 'status', r.status,
                            'reason', r.reason, 'created_at', r.created_at, 'resolution_note', r.resolution_note,
                            'resolved_at', r.resolved_at, 'new_match_id', r.new_match_id);
end
$$;

create or replace function public.mentorship_admin_set_payout(p_match_ids uuid[], p_status text, p_reference text default null)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_ref text;
  v_n int;
  v_ids uuid[];
  v_id uuid;
begin
  v_uid := public.mentorship_require_staff('admin');
  if p_status is null or not (p_status = any (public.mentorship_vocab('payout_status'))) then
    perform public.mentorship_fail('invalid_input', 'status');
  end if;
  v_ref := public.mentorship_txt(to_jsonb(p_reference), 120, 'reference');
  if p_match_ids is null or cardinality(p_match_ids) = 0 then
    return 0;
  end if;
  with u as (
    update public.mentorship_match
       set payout_status = p_status,
           paid_at = case when p_status = 'paid' then now() end,
           paid_by = case when p_status = 'paid' then v_uid end,
           payout_ref = case when p_status = 'paid' then coalesce(v_ref, payout_ref) else v_ref end
     where id = any (p_match_ids)
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from u;
  v_n := cardinality(v_ids);
  foreach v_id in array v_ids loop
    perform public.mentorship_log_event('payout_updated',
      (select x.mentor_id from public.mentorship_match x where x.id = v_id), v_id,
      jsonb_build_object('status', p_status, 'reference', v_ref));
  end loop;
  return v_n;
end
$$;

create or replace function public.mentorship_admin_set_review(p_review_id uuid, p_published boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  r public.mentorship_review;
begin
  perform public.mentorship_require_staff('admin');
  if p_published is null then
    perform public.mentorship_fail('invalid_input', 'published');
  end if;
  update public.mentorship_review set published = p_published where id = p_review_id returning * into r;
  if r.id is null then
    perform public.mentorship_fail('not_found', 'review');
  end if;
  perform public.mentorship_log_event('review_hidden', r.mentor_id, r.match_id,
    jsonb_build_object('review_id', r.id, 'published', r.published));
  return public.mentorship_review_json(r, true);
end
$$;

create or replace function public.mentorship_admin_set_config(p_key text, p_value jsonb, p_is_public boolean default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v jsonb := p_value;
  v_old jsonb;
  c public.mentorship_config;
  n numeric;
  s text;
  v_wa text;
begin
  v_uid := public.mentorship_require_staff('admin');
  if p_key is null or p_key !~ '^[a-z_]{2,40}$' then
    perform public.mentorship_fail('invalid_input', 'key');
  end if;
  if v is null or jsonb_typeof(v) = 'null' then
    perform public.mentorship_fail('invalid_input', p_key);
  end if;
  if p_key in ('mentor_fee_inr', 'quiz_pass_pct', 'quiz_cooldown_hours', 'review_after_days', 'max_mentees_cap',
               'min_reviews_for_rating', 'switch_limit', 'unmatched_after_days', 'red_flag_call_days') then
    if jsonb_typeof(v) = 'string' and btrim(v #>> '{}') ~ '^[0-9]+$' then
      v := to_jsonb(btrim(v #>> '{}')::numeric);
    end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then
      perform public.mentorship_fail('invalid_input', p_key);
    end if;
    n := (v #>> '{}')::numeric;
    if (p_key = 'mentor_fee_inr' and n not between 0 and 100000)
       or (p_key = 'quiz_pass_pct' and n not between 1 and 100)
       or (p_key = 'quiz_cooldown_hours' and n not between 0 and 720)
       or (p_key = 'review_after_days' and n not between 0 and 365)
       or (p_key = 'max_mentees_cap' and n not between 1 and 50)
       or (p_key = 'min_reviews_for_rating' and n not between 0 and 100)
       or (p_key = 'switch_limit' and n not between 0 and 10)
       or (p_key = 'unmatched_after_days' and n not between 0 and 365)
       or (p_key = 'red_flag_call_days' and n not between 1 and 60) then
      perform public.mentorship_fail('invalid_input', p_key);
    end if;
    v := to_jsonb(n::int);
  elsif p_key in ('lecture_video_url', 'padam_gpt_url', 'links_url') then
    if jsonb_typeof(v) <> 'string' then
      perform public.mentorship_fail('invalid_input', p_key);
    end if;
    s := btrim(v #>> '{}');
    -- https with a real host name (no port, no user part), then an optional path, query or hash.
    if s <> '' and (s !~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+([/?#][^\s<>"''`]*)?$'
                    or char_length(s) > 500) then
      perform public.mentorship_fail('invalid_input', p_key);
    end if;
    v := to_jsonb(s);
  elsif p_key = 'programs_enabled' then
    if jsonb_typeof(v) <> 'array'
       or exists (select 1 from jsonb_array_elements(v) e
                   where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (public.mentorship_vocab('programs')))) then
      perform public.mentorship_fail('invalid_input', p_key);
    end if;
    v := (select coalesce(jsonb_agg(k order by array_position(public.mentorship_vocab('programs'), k)), '[]'::jsonb)
            from (select distinct e #>> '{}' as k from jsonb_array_elements(v) e) d);
  elsif p_key = 'escalation_contact' then
    if jsonb_typeof(v) <> 'object' then
      perform public.mentorship_fail('invalid_input', p_key);
    end if;
    s := coalesce(public.mentorship_txt(v->'whatsapp', 30, 'escalation_contact.whatsapp'), '');
    v_wa := case when s = '' then '' else public.mentorship_norm_phone(s) end;
    if v_wa is null then
      perform public.mentorship_fail('invalid_input', 'escalation_contact.whatsapp');
    end if;
    s := coalesce(lower(public.mentorship_txt(v->'email', 254, 'escalation_contact.email')), '');
    if s <> '' and s !~ '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
      perform public.mentorship_fail('invalid_input', 'escalation_contact.email');
    end if;
    v := jsonb_build_object('name', coalesce(public.mentorship_txt(v->'name', 80, 'escalation_contact.name'), 'Team My Student Club'),
                            'whatsapp', v_wa, 'email', s);
  elsif p_key = 'unmatched_since' then
    s := public.mentorship_txt(v, 10, p_key);
    if s is null or s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      perform public.mentorship_fail('invalid_input', p_key);
    end if;
    begin
      perform s::date;
    exception when others then
      perform public.mentorship_fail('invalid_input', p_key);
    end;
    v := to_jsonb(s);
  end if;
  select value into v_old from public.mentorship_config where key = p_key;
  -- A new key is private unless the admin says otherwise; an existing key keeps its visibility.
  insert into public.mentorship_config (key, value, is_public, updated_by)
  values (p_key, v, coalesce(p_is_public, false), v_uid)
  on conflict (key) do update
     set value = excluded.value, is_public = coalesce(p_is_public, public.mentorship_config.is_public),
         updated_by = excluded.updated_by
  returning * into c;
  perform public.mentorship_log_event('config_changed', null, null,
    jsonb_build_object('key', p_key, 'old', v_old, 'new', c.value, 'is_public', c.is_public));
  return jsonb_build_object('key', c.key, 'value', c.value, 'is_public', c.is_public, 'note', c.note,
                            'updated_at', c.updated_at);
end
$$;

create or replace function public.mentorship_admin_upsert_staff(p_email text, p_role text, p_name text default null,
                                                                p_whatsapp text default null, p_active boolean default true)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_target uuid;
  v_email text;
  v_meta jsonb;
  v_wa text;
  v_name text;
  v_prev public.mentorship_staff;
begin
  v_uid := public.mentorship_require_staff('admin');
  if p_role is null or not (p_role = any (public.mentorship_vocab('staff_roles'))) then
    perform public.mentorship_fail('invalid_input', 'role');
  end if;
  if nullif(btrim(p_email), '') is null then
    perform public.mentorship_fail('invalid_input', 'email');
  end if;
  select u.id, u.email, u.raw_user_meta_data into v_target, v_email, v_meta
    from auth.users u where lower(u.email) = lower(btrim(p_email))
   order by u.created_at limit 1;
  if v_target is null then
    perform public.mentorship_fail('not_found', 'user');
  end if;
  -- Staff (admins and senior mentors) read pulses, private review notes and red-flag details,
  -- which mentees share with Team MSC and not with their mentor: a live mentor cannot be staff.
  if coalesce(p_active, true) and exists (select 1 from public.mentorship_mentor m
                                           where m.user_id = v_target and m.status in ('approved', 'paused')) then
    perform public.mentorship_fail('invalid_input', 'is_mentor');
  end if;
  v_wa := null;
  if nullif(btrim(p_whatsapp), '') is not null then
    v_wa := public.mentorship_norm_phone(p_whatsapp);
    if v_wa is null then
      perform public.mentorship_fail('invalid_input', 'whatsapp');
    end if;
  end if;
  select * into v_prev from public.mentorship_staff where user_id = v_target for update;
  if v_prev.user_id is not null and v_prev.role = 'admin' and v_prev.active
     and (p_role <> 'admin' or not coalesce(p_active, true))
     and not exists (select 1 from public.mentorship_staff s
                      where s.role = 'admin' and s.active and s.user_id <> v_target) then
    perform public.mentorship_fail('invalid_transition', 'last_admin');
  end if;
  v_name := coalesce(public.mentorship_txt(to_jsonb(p_name), 80, 'name'), nullif(btrim(v_prev.name), ''),
                     public.mentorship_meta_name(v_meta), split_part(v_email, '@', 1));
  insert into public.mentorship_staff (user_id, role, name, email, whatsapp, active, added_by)
  values (v_target, p_role, v_name, v_email, coalesce(v_wa, v_prev.whatsapp), coalesce(p_active, true), v_uid)
  on conflict (user_id) do update
     set role = excluded.role, name = excluded.name, email = excluded.email,
         whatsapp = coalesce(v_wa, public.mentorship_staff.whatsapp), active = excluded.active;
  perform public.mentorship_log_event('staff_changed', null, null,
    jsonb_build_object('user_id', v_target, 'role', p_role, 'active', coalesce(p_active, true),
                       'was', case when v_prev.user_id is null then null
                                   else jsonb_build_object('role', v_prev.role, 'active', v_prev.active) end));
  return public.mentorship_staff_json(v_target);
end
$$;

-- -----------------------------------------------------------------------------
-- 13. msc-mail Worker RPCs (service_role only) and mail triggers
--     Mail rows carry ids and names only; the Worker fetches contacts at send time.
-- -----------------------------------------------------------------------------

create or replace function public.mentorship_mail_contacts(p_match_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  x public.mentorship_match;
  mm public.mentorship_mentor;
  v_mentee jsonb;
begin
  select * into x from public.mentorship_match where id = p_match_id;
  if not found then
    return null;
  end if;
  select * into mm from public.mentorship_mentor where id = x.mentor_id;
  v_mentee := public.mentorship_person(x.mentee_user_id);
  return jsonb_build_object(
    'match_id', x.id, 'status', x.status, 'program', x.program,
    'program_label', public.mentorship_program_label(x.program), 'started_at', x.started_at,
    'week_start_current', public.mentorship_ist_week_start(now()),
    'pulse_this_week', exists (select 1 from public.mentorship_pulse p
                                where p.match_id = x.id and p.week_start = public.mentorship_ist_week_start(now())),
    'mentor', jsonb_build_object('mentor_id', mm.id, 'user_id', mm.user_id, 'full_name', mm.full_name,
                                 'first_name', public.mentorship_first_name(mm.full_name),
                                 'email', coalesce(public.mentorship_auth_email(mm.user_id), mm.email),
                                 'whatsapp', mm.whatsapp, 'mobile', mm.mobile),
    'mentee', jsonb_build_object('user_id', x.mentee_user_id, 'full_name', v_mentee->>'full_name',
                                 'first_name', v_mentee->>'first_name', 'email', v_mentee->>'email',
                                 'whatsapp', v_mentee->>'whatsapp', 'city', v_mentee->>'city'));
end
$$;

create or replace function public.mentorship_mail_mentor(p_mentor_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('mentor_id', mm.id, 'user_id', mm.user_id, 'status', mm.status, 'full_name', mm.full_name,
                            'first_name', public.mentorship_first_name(mm.full_name),
                            'email', coalesce(public.mentorship_auth_email(mm.user_id), mm.email),
                            'submitted_at', mm.submitted_at, 'approved_at', mm.approved_at,
                            'rejected_at', mm.rejected_at, 'reapply_after', mm.reapply_after,
                            'quiz_passed_at', mm.quiz_passed_at, 'status_changed_at', mm.status_changed_at)
    from public.mentorship_mentor mm where mm.id = p_mentor_id
$$;

-- Next Saturday 11:00 IST at or after max(started_at + 5 days, now() + 12 hours).
create or replace function public.mentorship_next_pulse_at(p_started timestamptz)
returns timestamptz
language plpgsql stable
set search_path = public, pg_temp
as $$
declare
  v_base timestamp := greatest(p_started + interval '5 days', now() + interval '12 hours') at time zone 'Asia/Kolkata';
  v_day date := v_base::date;
  v_cand timestamp;
begin
  v_cand := (v_day + ((6 - extract(isodow from v_day)::int + 7) % 7))::timestamp + time '11:00';
  if v_cand < v_base then
    v_cand := v_cand + interval '7 days';
  end if;
  return v_cand at time zone 'Asia/Kolkata';
end
$$;

-- Queue the next weekly pulse reminder for an active match. Idempotent (dedupe key per week).
create or replace function public.mentorship_mail_schedule_pulse(p_match_id uuid)
returns bigint
language plpgsql security definer
set search_path = public, pg_temp
set lock_timeout = '500ms'
as $$
declare
  x public.mentorship_match;
  v_at timestamptz;
  v_week date;
  v_user jsonb;
  v_name text;
  v_mentor text;
  v_id bigint;
begin
  if to_regprocedure('public.mail_enqueue(text, text, jsonb, text, timestamptz)') is null
     or to_regclass('public.mail_outbox') is null then
    return null;
  end if;
  begin
    select * into x from public.mentorship_match where id = p_match_id;
    if not found or x.status <> 'active' then
      return null;
    end if;
    v_at := public.mentorship_next_pulse_at(x.started_at);
    v_week := (v_at at time zone 'Asia/Kolkata')::date - 5;
    v_user := public.mail_user_row(x.mentee_user_id);
    v_name := coalesce((select nullif(btrim(s.full_name), '') from public.mentorship_student s
                         where s.user_id = x.mentee_user_id), public.mail_meta_name(v_user->'meta'));
    v_mentor := (select mm.full_name from public.mentorship_mentor mm where mm.id = x.mentor_id);
    v_id := public.mail_enqueue('mentorship_pulse_reminder', v_user->>'email',
      jsonb_build_object('match_id', x.id, 'user_id', x.mentee_user_id, 'name', v_name, 'mentor_name', v_mentor,
                         'week_start', to_char(v_week, 'YYYY-MM-DD')),
      'mentorship_pulse_reminder:' || x.id || ':' || to_char(v_week, 'YYYY-MM-DD'), v_at);
  exception when others then
    raise warning 'mentorship: pulse reminder skipped (% %)', sqlstate, sqlerrm;
    return null;
  end;
  return v_id;
end
$$;

-- mentorship_mentor_applied (a submission that lands on 'submitted': a re-application whose quiz
-- was already passed goes straight to review and gets no training mail), mentorship_mentor_approved
-- (every move to approved except a resume from paused) and mentorship_mentor_rejected (an hour
-- late, so an undo sends nothing; the staff reason is never in the payload).
create or replace function public.mentorship_trg_mentor_mail()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
set lock_timeout = '500ms'
as $$
declare
  n jsonb;
  o jsonb;
  v_user jsonb;
  v_name text;
begin
  begin
    if to_regprocedure('public.mail_enqueue(text, text, jsonb, text, timestamptz)') is null
       or to_regclass('public.mail_outbox') is null then
      return null;  -- msc-mail not installed yet: no mail, never an error
    end if;
    n := to_jsonb(new);
    o := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
    v_user := public.mail_user_row(public.mentorship_safe_uuid(n->>'user_id'));
    v_name := coalesce(nullif(btrim(n->>'full_name'), ''), public.mail_meta_name(v_user->'meta'));
    if n->>'status' = 'submitted' and n->>'submitted_at' is not null
       and n->>'submitted_at' is distinct from o->>'submitted_at' then
      perform public.mail_enqueue('mentorship_mentor_applied', v_user->>'email',
        jsonb_build_object('mentor_id', n->>'id', 'user_id', n->>'user_id', 'name', v_name),
        'mentorship_mentor_applied:' || (n->>'id') || ':'
          || floor(extract(epoch from (n->>'submitted_at')::timestamptz))::bigint, now());
    end if;
    if n->>'status' = 'approved' and coalesce(o->>'status', '') not in ('approved', 'paused') then
      perform public.mail_enqueue('mentorship_mentor_approved', v_user->>'email',
        jsonb_build_object('mentor_id', n->>'id', 'user_id', n->>'user_id', 'name', v_name,
                           'status_changed_at', coalesce(n->>'status_changed_at', now()::text)),
        'mentorship_mentor_approved:' || (n->>'id') || ':'
          || floor(extract(epoch from coalesce((n->>'status_changed_at')::timestamptz, now())))::bigint, now());
    end if;
    if n->>'status' = 'rejected' and n->>'rejected_at' is not null
       and n->>'rejected_at' is distinct from o->>'rejected_at' then
      perform public.mail_enqueue('mentorship_mentor_rejected', v_user->>'email',
        jsonb_build_object('mentor_id', n->>'id', 'user_id', n->>'user_id', 'name', v_name,
                           'rejected_at', n->>'rejected_at', 'reapply_after', n->>'reapply_after'),
        'mentorship_mentor_rejected:' || (n->>'id') || ':'
          || floor(extract(epoch from (n->>'rejected_at')::timestamptz))::bigint,
        now() + interval '1 hour');
    end if;
  exception when others then
    raise warning 'mentorship: mentor mail skipped (% %)', sqlstate, sqlerrm;
  end;
  return null;
end
$$;

drop trigger if exists mentorship_trg_mentor_mail on public.mentorship_mentor;
create trigger mentorship_trg_mentor_mail after insert or update of status, submitted_at on public.mentorship_mentor
  for each row execute function public.mentorship_trg_mentor_mail();

-- mentorship_match_mentor + mentorship_match_mentee on a new active match, then the first pulse reminder.
create or replace function public.mentorship_trg_match_mail()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
set lock_timeout = '500ms'
as $$
declare
  n jsonb;
  v_mentor public.mentorship_mentor;
  v_mentor_user jsonb;
  v_mentee_user jsonb;
  v_mentor_name text;
  v_mentee_name text;
  v_label text;
begin
  begin
    if to_regprocedure('public.mail_enqueue(text, text, jsonb, text, timestamptz)') is null
       or to_regclass('public.mail_outbox') is null then
      return null;  -- msc-mail not installed yet: no mail, never an error
    end if;
    n := to_jsonb(new);
    if n->>'status' is distinct from 'active' then
      return null;
    end if;
    select * into v_mentor from public.mentorship_mentor where id = public.mentorship_safe_uuid(n->>'mentor_id');
    v_mentor_user := public.mail_user_row(v_mentor.user_id);
    v_mentee_user := public.mail_user_row(public.mentorship_safe_uuid(n->>'mentee_user_id'));
    v_mentor_name := coalesce(nullif(btrim(v_mentor.full_name), ''), public.mail_meta_name(v_mentor_user->'meta'));
    v_mentee_name := coalesce((select nullif(btrim(s.full_name), '') from public.mentorship_student s
                                where s.user_id = public.mentorship_safe_uuid(n->>'mentee_user_id')),
                              public.mail_meta_name(v_mentee_user->'meta'));
    v_label := public.mentorship_program_label(n->>'program');
    perform public.mail_enqueue('mentorship_match_mentor', v_mentor_user->>'email',
      jsonb_build_object('match_id', n->>'id', 'mentor_id', v_mentor.id, 'user_id', v_mentor.user_id,
                         'name', v_mentor_name, 'mentee_name', v_mentee_name,
                         'program', n->>'program', 'program_label', v_label),
      'mentorship_match_mentor:' || (n->>'id'), now());
    perform public.mail_enqueue('mentorship_match_mentee', v_mentee_user->>'email',
      jsonb_build_object('match_id', n->>'id', 'user_id', n->>'mentee_user_id', 'name', v_mentee_name,
                         'mentor_name', v_mentor_name, 'program', n->>'program', 'program_label', v_label),
      'mentorship_match_mentee:' || (n->>'id'), now());
    perform public.mentorship_mail_schedule_pulse(public.mentorship_safe_uuid(n->>'id'));
  exception when others then
    raise warning 'mentorship: match mail skipped (% %)', sqlstate, sqlerrm;
  end;
  return null;
end
$$;

drop trigger if exists mentorship_trg_match_mail on public.mentorship_match;
create trigger mentorship_trg_match_mail after insert on public.mentorship_match
  for each row execute function public.mentorship_trg_match_mail();

-- -----------------------------------------------------------------------------
-- 14. Storage: buckets and policies (guarded, the msc-mail pattern)
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('mentorship-photos', 'mentorship-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
         ('mentorship-cv', 'mentorship-cv', false, 5242880, array['application/pdf'])
  on conflict (id) do update
     set public = excluded.public, file_size_limit = excluded.file_size_limit,
         allowed_mime_types = excluded.allowed_mime_types;
exception when others then
  raise warning 'mentorship: could not create storage buckets (% %). Create them in Supabase Storage: '
                'mentorship-photos (public, 2 MB, image/jpeg image/png image/webp) and '
                'mentorship-cv (private, 5 MB, application/pdf).', sqlstate, sqlerrm;
end
$$;

do $$
declare
  b record;
begin
  for b in select * from (values ('photos', 'mentorship-photos'), ('cv', 'mentorship-cv')) v(short, bucket) loop
    execute format('drop policy if exists %I on storage.objects', 'mentorship_' || b.short || '_insert');
    -- Uploads only by mentor applicants (a mentor row, any status), into their own folder: no
    -- free public image hosting for every signed-up user.
    execute format('create policy %I on storage.objects for insert to authenticated
                      with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text
                                  and public.mentorship_has_mentor_row())',
                   'mentorship_' || b.short || '_insert', b.bucket);
    execute format('drop policy if exists %I on storage.objects', 'mentorship_' || b.short || '_update');
    execute format('create policy %I on storage.objects for update to authenticated
                      using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)
                      with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)',
                   'mentorship_' || b.short || '_update', b.bucket, b.bucket);
    execute format('drop policy if exists %I on storage.objects', 'mentorship_' || b.short || '_delete');
    execute format('create policy %I on storage.objects for delete to authenticated
                      using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)',
                   'mentorship_' || b.short || '_delete', b.bucket);
  end loop;
  -- Own photos are readable for upserts; everyone else reads photos through the public URL.
  drop policy if exists mentorship_photos_select on storage.objects;
  create policy mentorship_photos_select on storage.objects for select to authenticated
    using (bucket_id = 'mentorship-photos' and (storage.foldername(name))[1] = auth.uid()::text);
  -- CVs: the owner, or Team MSC staff (signed URLs from the admin page).
  drop policy if exists mentorship_cv_select on storage.objects;
  create policy mentorship_cv_select on storage.objects for select to authenticated
    using (bucket_id = 'mentorship-cv'
           and ((storage.foldername(name))[1] = auth.uid()::text or public.mentorship_is_staff()));
exception when others then
  raise warning 'mentorship: could not create storage policies (% %). Add them in Supabase Storage > Policies '
                '(see supabase/mentorship/README.md).', sqlstate, sqlerrm;
end
$$;

-- -----------------------------------------------------------------------------
-- 15. Config seed (existing values are never overwritten)
-- -----------------------------------------------------------------------------

insert into public.mentorship_config (key, value, is_public, note) values
  ('mentor_fee_inr', '500', true, 'Rs per mentee per batch; copied onto each match when it is created'),
  ('lecture_video_url', '""', true, 'Mentor lecture video (YouTube, Vimeo, Loom, Drive or mp4). Empty shows "lecture coming soon"'),
  ('padam_gpt_url', '""', true, 'Padam GPT link for mentors. Empty shows "coming soon"'),
  ('links_url', '"https://www.mystudentclub.com/links"', true, 'The one page with every MSC resource'),
  ('escalation_contact', '{"name": "Team My Student Club", "whatsapp": "", "email": ""}', false,
   'Shown to mentors who have no senior mentor assigned (private: mentors read it through mentorship_my_mentor)'),
  ('programs_enabled', '["industrial-training"]', true, 'Programs open for mentorship: industrial-training, articleship, ca-fresher'),
  ('quiz_pass_pct', '80', true, 'Mentor quiz pass mark (percent)'),
  ('quiz_cooldown_hours', '24', true, 'Wait after a failed quiz attempt'),
  ('review_after_days', '28', true, 'Days after matching before a student can review'),
  ('max_mentees_cap', '10', true, 'Highest max_mentees a mentor can pick'),
  ('min_reviews_for_rating', '3', true, 'Below this, profiles show "New mentor"'),
  ('switch_limit', '1', true, 'Switch requests per student per program'),
  ('unmatched_after_days', '2', false, 'Red flag: enrolled with no mentor after this many days'),
  ('unmatched_since', '"2026-10-01"', false, 'Ignore enrollments older than this date (earlier batches)'),
  ('red_flag_call_days', '8', false, 'Red flag: no weekly call logged for this many days')
on conflict (key) do nothing;

-- The escalation contact holds a staff WhatsApp number or email once it is filled in, so it is
-- never public (an earlier seed made it public). Pages read it through mentorship_my_mentor().
update public.mentorship_config set is_public = false where key = 'escalation_contact' and is_public;

-- -----------------------------------------------------------------------------
-- 16. Function privileges. Every mentorship function is revoked from public, anon
--     and authenticated, then granted back explicitly (names listed, so nothing
--     from the old portal is touched).
-- -----------------------------------------------------------------------------

do $$
declare
  f record;
  v_all text[] := array[
    -- helpers and triggers (internal)
    'mentorship_vocab', 'mentorship_stage_required', 'mentorship_tier', 'mentorship_fail', 'mentorship_course_program',
    'mentorship_program_label', 'mentorship_norm_phone', 'mentorship_first_name', 'mentorship_short_name',
    'mentorship_meta_name', 'mentorship_obj', 'mentorship_safe_uuid', 'mentorship_ist_date', 'mentorship_ist_midnight',
    'mentorship_ist_week_start', 'mentorship_week_no', 'mentorship_cfg_default', 'mentorship_cfg', 'mentorship_cfg_int',
    'mentorship_enabled_programs', 'mentorship_is_staff', 'mentorship_require_staff', 'mentorship_log_event',
    'mentorship_profile_row', 'mentorship_person', 'mentorship_actor_name', 'mentorship_col_exists',
    'mentorship_enrolled_programs', 'mentorship_enrollment_info', 'mentorship_enrollment_users', 'mentorship_txt',
    'mentorship_int', 'mentorship_bool', 'mentorship_key', 'mentorship_list', 'mentorship_url', 'mentorship_ym',
    'mentorship_phone', 'mentorship_path', 'mentorship_scores', 'mentorship_public_mentor', 'mentorship_own_mentor',
    'mentorship_admin_mentor_json', 'mentorship_auth_email', 'mentorship_student_match', 'mentorship_admin_match_json',
    'mentorship_mentee_card', 'mentorship_review_json', 'mentorship_missing_fields', 'mentorship_trg_touch',
    'mentorship_trg_review_stats', 'mentorship_mentor_match', 'mentorship_unmatched_list', 'mentorship_red_flags_list',
    'mentorship_switch_json', 'mentorship_staff_json', 'mentorship_lock_mentor_for', 'mentorship_reassign_internal',
    'mentorship_next_pulse_at', 'mentorship_trg_mentor_mail', 'mentorship_trg_match_mail',
    'mentorship_has_contact', 'mentorship_assert_no_contact', 'mentorship_name_ok', 'mentorship_name',
    'mentorship_review_url', 'mentorship_has_mentor_row',
    -- public / signed-in
    'mentorship_get_config', 'mentorship_whoami',
    -- mentor
    'mentorship_save_mentor', 'mentorship_submit_application', 'mentorship_my_mentor', 'mentorship_mark_training',
    'mentorship_quiz_questions', 'mentorship_submit_quiz', 'mentorship_my_mentees', 'mentorship_set_checklist',
    'mentorship_log_call',
    -- student
    'mentorship_save_student', 'mentorship_list_mentors', 'mentorship_mentor_public', 'mentorship_book',
    'mentorship_my_match', 'mentorship_submit_pulse', 'mentorship_submit_review', 'mentorship_request_switch',
    -- staff
    'mentorship_admin_overview', 'mentorship_admin_red_flags', 'mentorship_admin_mentors',
    'mentorship_admin_mentor_detail', 'mentorship_admin_matches', 'mentorship_admin_unmatched',
    'mentorship_admin_switch_requests', 'mentorship_admin_reviews', 'mentorship_admin_staff',
    'mentorship_admin_get_config', 'mentorship_admin_set_status', 'mentorship_admin_update_mentor',
    'mentorship_admin_create_match', 'mentorship_admin_reassign', 'mentorship_admin_end_match',
    'mentorship_admin_resolve_switch', 'mentorship_admin_set_payout', 'mentorship_admin_set_review',
    'mentorship_admin_set_config', 'mentorship_admin_upsert_staff',
    -- msc-mail Worker
    'mentorship_mail_contacts', 'mentorship_mail_mentor', 'mentorship_mail_schedule_pulse'];
  v_authenticated text[] := array[
    'mentorship_get_config', 'mentorship_whoami', 'mentorship_is_staff', 'mentorship_has_mentor_row',
    'mentorship_save_mentor', 'mentorship_submit_application', 'mentorship_my_mentor', 'mentorship_mark_training',
    'mentorship_quiz_questions', 'mentorship_submit_quiz', 'mentorship_my_mentees', 'mentorship_set_checklist',
    'mentorship_log_call',
    'mentorship_save_student', 'mentorship_list_mentors', 'mentorship_mentor_public', 'mentorship_book',
    'mentorship_my_match', 'mentorship_submit_pulse', 'mentorship_submit_review', 'mentorship_request_switch',
    'mentorship_admin_overview', 'mentorship_admin_red_flags', 'mentorship_admin_mentors',
    'mentorship_admin_mentor_detail', 'mentorship_admin_matches', 'mentorship_admin_unmatched',
    'mentorship_admin_switch_requests', 'mentorship_admin_reviews', 'mentorship_admin_staff',
    'mentorship_admin_get_config', 'mentorship_admin_set_status', 'mentorship_admin_update_mentor',
    'mentorship_admin_create_match', 'mentorship_admin_reassign', 'mentorship_admin_end_match',
    'mentorship_admin_resolve_switch', 'mentorship_admin_set_payout', 'mentorship_admin_set_review',
    'mentorship_admin_set_config', 'mentorship_admin_upsert_staff'];
  v_service text[] := array['mentorship_mail_contacts', 'mentorship_mail_mentor', 'mentorship_mail_schedule_pulse',
                            'mentorship_get_config', 'mentorship_vocab'];
begin
  for f in select p.oid::regprocedure as sig, p.proname
             from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname = any (v_all) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname = any (v_authenticated) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if f.proname = 'mentorship_get_config' then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
    if f.proname = any (v_service) then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end
$$;

-- Ask PostgREST (the Supabase API) to pick up the new or removed functions right away.
notify pgrst, 'reload schema';

commit;
