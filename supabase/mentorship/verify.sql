-- =============================================================================
-- MSC Mentorship: read-only checks for 001_mentorship.sql (and the private quiz seed).
-- Run in the Supabase SQL editor after applying. It changes nothing.
-- Every row should say ok. WARN rows are expected only where the detail says so
-- (for example before the quiz seed is applied, or before msc-mail is installed).
-- =============================================================================

with
exp_tables(t) as (
  values ('mentorship_config'), ('mentorship_staff'), ('mentorship_mentor'), ('mentorship_student'),
         ('mentorship_match'), ('mentorship_checklist'), ('mentorship_call_log'), ('mentorship_pulse'),
         ('mentorship_review'), ('mentorship_quiz_question'), ('mentorship_quiz_attempt'),
         ('mentorship_switch_request'), ('mentorship_event')
),
tbl as (
  select e.t, c.oid, coalesce(c.relrowsecurity, false) as rls
    from exp_tables e
    left join pg_class c on c.relname = e.t and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
),
our_fns(f) as (
  -- every function 001_mentorship.sql creates (other mentorship_* functions are not judged)
  values ('mentorship_actor_name'), ('mentorship_admin_create_match'), ('mentorship_admin_end_match'), ('mentorship_admin_get_config'),
         ('mentorship_admin_match_json'), ('mentorship_admin_matches'), ('mentorship_admin_mentor_detail'), ('mentorship_admin_mentor_json'),
         ('mentorship_admin_mentors'), ('mentorship_admin_overview'), ('mentorship_admin_reassign'), ('mentorship_admin_red_flags'),
         ('mentorship_admin_resolve_switch'), ('mentorship_admin_reviews'), ('mentorship_admin_set_config'), ('mentorship_admin_set_payout'),
         ('mentorship_admin_set_review'), ('mentorship_admin_set_status'), ('mentorship_admin_staff'), ('mentorship_admin_switch_requests'),
         ('mentorship_admin_unmatched'), ('mentorship_admin_update_mentor'), ('mentorship_admin_upsert_staff'), ('mentorship_auth_email'),
         ('mentorship_book'), ('mentorship_bool'), ('mentorship_cfg'), ('mentorship_cfg_default'),
         ('mentorship_cfg_int'), ('mentorship_col_exists'), ('mentorship_course_program'), ('mentorship_enabled_programs'),
         ('mentorship_enrolled_programs'), ('mentorship_enrollment_info'), ('mentorship_enrollment_users'), ('mentorship_fail'),
         ('mentorship_first_name'), ('mentorship_get_config'), ('mentorship_int'), ('mentorship_is_staff'),
         ('mentorship_ist_date'), ('mentorship_ist_midnight'), ('mentorship_ist_week_start'), ('mentorship_key'),
         ('mentorship_list'), ('mentorship_list_mentors'), ('mentorship_lock_mentor_for'), ('mentorship_log_call'),
         ('mentorship_log_event'), ('mentorship_mail_contacts'), ('mentorship_mail_mentor'), ('mentorship_mail_schedule_pulse'),
         ('mentorship_mark_training'), ('mentorship_mentee_card'), ('mentorship_mentor_match'), ('mentorship_mentor_public'),
         ('mentorship_meta_name'), ('mentorship_missing_fields'), ('mentorship_my_match'), ('mentorship_my_mentees'),
         ('mentorship_my_mentor'), ('mentorship_next_pulse_at'), ('mentorship_norm_phone'), ('mentorship_obj'),
         ('mentorship_own_mentor'), ('mentorship_path'), ('mentorship_person'), ('mentorship_phone'),
         ('mentorship_profile_row'), ('mentorship_program_label'), ('mentorship_public_mentor'), ('mentorship_quiz_questions'),
         ('mentorship_reassign_internal'), ('mentorship_red_flags_list'), ('mentorship_request_switch'), ('mentorship_require_staff'),
         ('mentorship_review_json'), ('mentorship_safe_uuid'), ('mentorship_save_mentor'), ('mentorship_save_student'),
         ('mentorship_scores'), ('mentorship_set_checklist'), ('mentorship_short_name'), ('mentorship_staff_json'),
         ('mentorship_stage_required'), ('mentorship_student_match'), ('mentorship_submit_application'), ('mentorship_submit_pulse'),
         ('mentorship_submit_quiz'), ('mentorship_submit_review'), ('mentorship_switch_json'), ('mentorship_tier'),
         ('mentorship_trg_match_mail'), ('mentorship_trg_mentor_mail'), ('mentorship_trg_review_stats'), ('mentorship_trg_touch'),
         ('mentorship_txt'), ('mentorship_unmatched_list'), ('mentorship_url'), ('mentorship_vocab'),
         ('mentorship_week_no'), ('mentorship_whoami'), ('mentorship_ym'),
         ('mentorship_has_contact'), ('mentorship_assert_no_contact'), ('mentorship_name_ok'), ('mentorship_name'),
         ('mentorship_review_url'), ('mentorship_has_mentor_row')
),
api_fns(f) as (
  values ('mentorship_whoami'), ('mentorship_save_mentor'), ('mentorship_submit_application'),
         ('mentorship_my_mentor'), ('mentorship_mark_training'), ('mentorship_quiz_questions'),
         ('mentorship_submit_quiz'), ('mentorship_my_mentees'), ('mentorship_set_checklist'),
         ('mentorship_log_call'), ('mentorship_save_student'), ('mentorship_list_mentors'),
         ('mentorship_mentor_public'), ('mentorship_book'), ('mentorship_my_match'), ('mentorship_submit_pulse'),
         ('mentorship_submit_review'), ('mentorship_request_switch'), ('mentorship_admin_overview'),
         ('mentorship_admin_red_flags'), ('mentorship_admin_mentors'), ('mentorship_admin_mentor_detail'),
         ('mentorship_admin_matches'), ('mentorship_admin_unmatched'), ('mentorship_admin_switch_requests'),
         ('mentorship_admin_reviews'), ('mentorship_admin_staff'), ('mentorship_admin_get_config'),
         ('mentorship_admin_set_status'), ('mentorship_admin_update_mentor'), ('mentorship_admin_create_match'),
         ('mentorship_admin_reassign'), ('mentorship_admin_end_match'), ('mentorship_admin_resolve_switch'),
         ('mentorship_admin_set_payout'), ('mentorship_admin_set_review'), ('mentorship_admin_set_config'),
         ('mentorship_admin_upsert_staff'),
         ('mentorship_get_config'), ('mentorship_is_staff'), ('mentorship_has_mentor_row')
),
mail_fns(f) as (
  values ('mentorship_mail_contacts'), ('mentorship_mail_mentor'), ('mentorship_mail_schedule_pulse')
),
internal_fns(f) as (
  select f from our_fns except select f from api_fns except select f from mail_fns
),
fns as (
  select p.oid, p.proname from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in (select f from our_fns)
),
exp_triggers(tbl, tg) as (
  values ('mentorship_config', 'mentorship_trg_touch'), ('mentorship_staff', 'mentorship_trg_touch'),
         ('mentorship_mentor', 'mentorship_trg_touch'), ('mentorship_student', 'mentorship_trg_touch'),
         ('mentorship_match', 'mentorship_trg_touch'), ('mentorship_checklist', 'mentorship_trg_touch'),
         ('mentorship_call_log', 'mentorship_trg_touch'), ('mentorship_pulse', 'mentorship_trg_touch'),
         ('mentorship_review', 'mentorship_trg_touch'), ('mentorship_review', 'mentorship_trg_review_stats'),
         ('mentorship_mentor', 'mentorship_trg_mentor_mail'), ('mentorship_match', 'mentorship_trg_match_mail')
),
exp_config(k) as (
  values ('mentor_fee_inr'), ('lecture_video_url'), ('padam_gpt_url'), ('links_url'), ('escalation_contact'),
         ('programs_enabled'), ('quiz_pass_pct'), ('quiz_cooldown_hours'), ('review_after_days'),
         ('max_mentees_cap'), ('min_reviews_for_rating'), ('switch_limit'), ('unmatched_after_days'),
         ('unmatched_since'), ('red_flag_call_days')
),
exp_policies(p) as (
  values ('mentorship_photos_insert'), ('mentorship_photos_update'), ('mentorship_photos_delete'),
         ('mentorship_photos_select'), ('mentorship_cv_insert'), ('mentorship_cv_update'),
         ('mentorship_cv_delete'), ('mentorship_cv_select')
),
checks as (
  select 1 as n, 'tables exist (13)' as check_name,
         case when count(*) filter (where oid is null) = 0 then 'ok' else 'FAIL' end as status,
         coalesce('missing: ' || string_agg(t, ', ') filter (where oid is null), count(*) || ' tables') as detail
    from tbl
  union all
  select 2, 'row level security on',
         case when count(*) filter (where oid is not null and not rls) = 0 then 'ok' else 'FAIL' end,
         coalesce('RLS off: ' || string_agg(t, ', ') filter (where oid is not null and not rls), 'all on')
    from tbl
  union all
  select 3, 'no policies on mentorship tables (deny-all)',
         case when count(*) = 0 then 'ok' else 'FAIL' end,
         coalesce(string_agg(tablename || '.' || policyname, ', '), 'none')
    from pg_policies where schemaname = 'public' and tablename in (select t from exp_tables)
  union all
  select 4, 'anon/authenticated have no table rights',
         case when count(*) = 0 then 'ok' else 'FAIL' end,
         coalesce(string_agg(r.role || ' on ' || tbl.t, ', '), 'none')
    from tbl cross join (values ('anon'), ('authenticated')) r(role)
   where tbl.oid is not null
     and has_table_privilege(r.role, tbl.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  union all
  select 5, 'all 109 functions present',
         case when count(*) filter (where not exists (select 1 from fns where fns.proname = o.f)) = 0 then 'ok' else 'FAIL' end,
         coalesce('missing: ' || string_agg(o.f, ', ') filter (where not exists (select 1 from fns where fns.proname = o.f)),
                  count(*) || ' functions')
    from our_fns o
  union all
  select 6, 'API functions present (41)',
         case when count(*) filter (where not exists (select 1 from fns where fns.proname = a.f)) = 0 then 'ok' else 'FAIL' end,
         coalesce('missing: ' || string_agg(a.f, ', ') filter (where not exists (select 1 from fns where fns.proname = a.f)),
                  count(*) || ' functions')
    from api_fns a
  union all
  select 7, 'authenticated can execute every API function',
         case when count(*) = 0 then 'ok' else 'FAIL' end,
         coalesce('no grant: ' || string_agg(fns.proname, ', '), 'all granted')
    from fns where fns.proname in (select f from api_fns) and not has_function_privilege('authenticated', fns.oid, 'EXECUTE')
  union all
  select 8, 'anon can execute only mentorship_get_config',
         case when count(*) = 0 then 'ok' else 'FAIL' end,
         coalesce(string_agg(fns.proname, ', '), 'only get_config')
    from fns where fns.proname <> 'mentorship_get_config' and has_function_privilege('anon', fns.oid, 'EXECUTE')
  union all
  select 9, 'mail RPCs: service_role only',
         case when count(*) filter (where fns.oid is null) = 0
                   and count(*) filter (where fns.oid is not null and not has_function_privilege('service_role', fns.oid, 'EXECUTE')) = 0
                   and count(*) filter (where fns.oid is not null and has_function_privilege('authenticated', fns.oid, 'EXECUTE')) = 0
              then 'ok' else 'FAIL' end,
         count(*) filter (where fns.oid is not null) || ' of 3 present'
    from mail_fns m left join fns on fns.proname = m.f
  union all
  select 10, 'internal helpers not executable by anon or authenticated',
         case when count(*) = 0 then 'ok' else 'FAIL' end,
         coalesce(string_agg(fns.proname, ', '), 'none exposed')
    from fns where fns.proname in (select f from internal_fns)
                and (has_function_privilege('authenticated', fns.oid, 'EXECUTE') or has_function_privilege('anon', fns.oid, 'EXECUTE'))
  union all
  select 11, 'triggers (12)',
         case when count(*) filter (where tg.oid is null) = 0 then 'ok' else 'FAIL' end,
         coalesce('missing: ' || string_agg(e.tbl || '.' || e.tg, ', ') filter (where tg.oid is null), count(*) || ' triggers')
    from exp_triggers e
    left join pg_trigger tg on tg.tgname = e.tg and not tg.tgisinternal
                           and tg.tgrelid = to_regclass('public.' || e.tbl)
  union all
  select 12, 'config keys (15)',
         case when count(*) filter (where c.key is null) = 0 then 'ok' else 'FAIL' end,
         coalesce('missing: ' || string_agg(e.k, ', ') filter (where c.key is null), count(*) || ' keys')
    from exp_config e left join public.mentorship_config c on c.key = e.k
  union all
  select 13, 'storage buckets (2)',
         case when count(*) = 2 and bool_and((b.id = 'mentorship-photos') = coalesce(b.public, false)) then 'ok' else 'WARN' end,
         coalesce(string_agg(b.id || case when b.public then ' (public)' else ' (private)' end, ', '),
                  'none: create them in Supabase Storage (README.md)')
    from storage.buckets b where b.id in ('mentorship-photos', 'mentorship-cv')
  union all
  select 14, 'storage policies (8)',
         case when count(*) filter (where p.policyname is null) = 0 then 'ok' else 'WARN' end,
         coalesce('missing: ' || string_agg(e.p, ', ') filter (where p.policyname is null), count(*) || ' policies')
    from exp_policies e left join pg_policies p on p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = e.p
  union all
  select 15, 'one active mentor per student per program (unique index)',
         case when count(*) = 1 then 'ok' else 'FAIL' end,
         coalesce(string_agg(indexname, ', '), 'missing')
    from pg_indexes where schemaname = 'public' and indexname = 'mentorship_match_one_active_idx'
                      and indexdef ilike '%unique%' and indexdef ilike '%where%active%'
  union all
  select 16, 'quiz questions seeded',
         case when count(*) filter (where active) >= 12 then 'ok' else 'WARN' end,
         case when count(*) = 0 then 'none yet: apply mentorship_quiz_seed.local.sql'
              else count(*) filter (where active) || ' active questions' end
    from public.mentorship_quiz_question
  union all
  select 17, 'active admin in mentorship_staff',
         case when count(*) > 0 then 'ok' else 'WARN' end,
         case when count(*) = 0 then 'none yet: add the first admin by hand (README.md)' else count(*) || ' active admin(s)' end
    from public.mentorship_staff where role = 'admin' and active
  union all
  select 18, 'msc-mail outbox (mail triggers)',
         case when to_regprocedure('public.mail_enqueue(text, text, jsonb, text, timestamptz)') is not null
                   and to_regclass('public.mail_outbox') is not null then 'ok' else 'WARN' end,
         case when to_regprocedure('public.mail_enqueue(text, text, jsonb, text, timestamptz)') is not null
                   and to_regclass('public.mail_outbox') is not null
              then 'installed: mentorship mails are queued'
              else 'not installed: mail triggers are silent no-ops until msc-mail APPLY-ALL.sql runs' end
)
select n, check_name, status, detail from checks order by n;
