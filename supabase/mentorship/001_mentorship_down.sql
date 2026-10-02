-- =============================================================================
-- MSC Mentorship: ROLLBACK of 001_mentorship.sql
-- =============================================================================
-- WHAT IT DOES
--   Drops every table, trigger, function and storage policy that 001_mentorship.sql
--   created, by exact name. DATA IN THE mentorship_* TABLES IS DELETED (mentors,
--   matches, call logs, pulses, reviews, quiz attempts, audit events, config, staff).
--   Export anything you need first (the admin page has CSV exports).
-- KEPT ON PURPOSE
--   - Storage buckets mentorship-photos and mentorship-cv and the files in them
--     (remove them in Supabase Storage if you really want them gone).
--   - Rows already queued in public.mail_outbox (they belong to msc-mail; mentorship
--     events fail there as "unknown event" once the Worker handler is removed).
--   - The old portal (mentor_profiles, mentorship_requests, mentorship_relationships,
--     mentor_reviews, ...) and any other function, even one starting with mentorship_.
-- HOW TO APPLY
--   Paste into the Supabase SQL editor and run. One transaction, safe to re-run.
-- =============================================================================

begin;
set local lock_timeout = '3s';

-- Storage policies (guarded: storage may not be writable from SQL).
do $$
begin
  drop policy if exists mentorship_photos_insert on storage.objects;
  drop policy if exists mentorship_photos_update on storage.objects;
  drop policy if exists mentorship_photos_delete on storage.objects;
  drop policy if exists mentorship_photos_select on storage.objects;
  drop policy if exists mentorship_cv_insert on storage.objects;
  drop policy if exists mentorship_cv_update on storage.objects;
  drop policy if exists mentorship_cv_delete on storage.objects;
  drop policy if exists mentorship_cv_select on storage.objects;
exception when others then
  raise warning 'mentorship rollback: could not drop storage policies (% %). Remove the mentorship_* policies '
                'on storage.objects in Supabase Storage > Policies.', sqlstate, sqlerrm;
end
$$;

-- Tables (their triggers, indexes and constraints go with them). CASCADE only reaches objects
-- that depend on these mentorship tables, such as the functions that take their row types.
drop table if exists public.mentorship_event cascade;
drop table if exists public.mentorship_switch_request cascade;
drop table if exists public.mentorship_quiz_attempt cascade;
drop table if exists public.mentorship_quiz_question cascade;
drop table if exists public.mentorship_review cascade;
drop table if exists public.mentorship_pulse cascade;
drop table if exists public.mentorship_call_log cascade;
drop table if exists public.mentorship_checklist cascade;
drop table if exists public.mentorship_match cascade;
drop table if exists public.mentorship_student cascade;
drop table if exists public.mentorship_mentor cascade;
drop table if exists public.mentorship_staff cascade;
drop table if exists public.mentorship_config cascade;

-- Functions, by exact signature (functions that took a dropped table's row type print
-- a "does not exist, skipping" notice: they were removed with the table).
drop function if exists public.mentorship_actor_name(uuid) cascade;
drop function if exists public.mentorship_admin_create_match(uuid,uuid,text,boolean) cascade;
drop function if exists public.mentorship_admin_end_match(uuid,text,text) cascade;
drop function if exists public.mentorship_admin_get_config() cascade;
drop function if exists public.mentorship_admin_match_json(uuid) cascade;
drop function if exists public.mentorship_admin_matches(text,text) cascade;
drop function if exists public.mentorship_admin_mentor_detail(uuid) cascade;
drop function if exists public.mentorship_admin_mentor_json(public.mentorship_mentor) cascade;
drop function if exists public.mentorship_admin_mentors(text) cascade;
drop function if exists public.mentorship_admin_overview() cascade;
drop function if exists public.mentorship_admin_reassign(uuid,uuid,text,boolean) cascade;
drop function if exists public.mentorship_admin_red_flags() cascade;
drop function if exists public.mentorship_admin_resolve_switch(uuid,boolean,uuid,text) cascade;
drop function if exists public.mentorship_admin_reviews(uuid) cascade;
drop function if exists public.mentorship_admin_set_config(text,jsonb,boolean) cascade;
drop function if exists public.mentorship_admin_set_payout(uuid[],text,text) cascade;
drop function if exists public.mentorship_admin_set_review(uuid,boolean) cascade;
drop function if exists public.mentorship_admin_set_status(uuid,text,text) cascade;
drop function if exists public.mentorship_admin_staff() cascade;
drop function if exists public.mentorship_admin_switch_requests(text) cascade;
drop function if exists public.mentorship_admin_unmatched(text) cascade;
drop function if exists public.mentorship_admin_update_mentor(uuid,jsonb) cascade;
drop function if exists public.mentorship_admin_upsert_staff(text,text,text,text,boolean) cascade;
drop function if exists public.mentorship_assert_no_contact(text,text) cascade;
drop function if exists public.mentorship_auth_email(uuid) cascade;
drop function if exists public.mentorship_book(uuid,text) cascade;
drop function if exists public.mentorship_bool(jsonb,text) cascade;
drop function if exists public.mentorship_cfg(text) cascade;
drop function if exists public.mentorship_cfg_default(text) cascade;
drop function if exists public.mentorship_cfg_int(text) cascade;
drop function if exists public.mentorship_col_exists(text,text) cascade;
drop function if exists public.mentorship_course_program(text) cascade;
drop function if exists public.mentorship_enabled_programs() cascade;
drop function if exists public.mentorship_enrolled_programs(uuid) cascade;
drop function if exists public.mentorship_enrollment_info(uuid,text) cascade;
drop function if exists public.mentorship_enrollment_users(text) cascade;
drop function if exists public.mentorship_fail(text,text) cascade;
drop function if exists public.mentorship_first_name(text) cascade;
drop function if exists public.mentorship_get_config() cascade;
drop function if exists public.mentorship_has_contact(text) cascade;
drop function if exists public.mentorship_has_mentor_row() cascade;
drop function if exists public.mentorship_int(jsonb,integer,integer,text) cascade;
drop function if exists public.mentorship_is_staff(text) cascade;
drop function if exists public.mentorship_ist_date(timestamp with time zone) cascade;
drop function if exists public.mentorship_ist_midnight(date) cascade;
drop function if exists public.mentorship_ist_week_start(timestamp with time zone) cascade;
drop function if exists public.mentorship_key(jsonb,text,text) cascade;
drop function if exists public.mentorship_list(jsonb,text,integer,integer,text) cascade;
drop function if exists public.mentorship_list_mentors(text) cascade;
drop function if exists public.mentorship_lock_mentor_for(uuid,uuid,text,boolean) cascade;
drop function if exists public.mentorship_log_call(uuid,integer,date,text,integer,integer,text) cascade;
drop function if exists public.mentorship_log_event(text,uuid,uuid,jsonb) cascade;
drop function if exists public.mentorship_mail_contacts(uuid) cascade;
drop function if exists public.mentorship_mail_mentor(uuid) cascade;
drop function if exists public.mentorship_mail_schedule_pulse(uuid) cascade;
drop function if exists public.mentorship_mark_training(text) cascade;
drop function if exists public.mentorship_mentee_card(uuid) cascade;
drop function if exists public.mentorship_mentor_match(uuid) cascade;
drop function if exists public.mentorship_mentor_public(uuid) cascade;
drop function if exists public.mentorship_meta_name(jsonb) cascade;
drop function if exists public.mentorship_missing_fields(public.mentorship_mentor) cascade;
drop function if exists public.mentorship_my_match(text) cascade;
drop function if exists public.mentorship_my_mentees(boolean) cascade;
drop function if exists public.mentorship_my_mentor() cascade;
drop function if exists public.mentorship_name(jsonb,text) cascade;
drop function if exists public.mentorship_name_ok(text) cascade;
drop function if exists public.mentorship_next_pulse_at(timestamp with time zone) cascade;
drop function if exists public.mentorship_norm_phone(text) cascade;
drop function if exists public.mentorship_obj(jsonb) cascade;
drop function if exists public.mentorship_own_mentor(public.mentorship_mentor) cascade;
drop function if exists public.mentorship_path(jsonb,uuid,text) cascade;
drop function if exists public.mentorship_person(uuid) cascade;
drop function if exists public.mentorship_phone(jsonb,text) cascade;
drop function if exists public.mentorship_profile_row(uuid) cascade;
drop function if exists public.mentorship_program_label(text) cascade;
drop function if exists public.mentorship_public_mentor(public.mentorship_mentor) cascade;
drop function if exists public.mentorship_quiz_questions() cascade;
drop function if exists public.mentorship_reassign_internal(uuid,uuid,text,boolean,text) cascade;
drop function if exists public.mentorship_red_flags_list() cascade;
drop function if exists public.mentorship_request_switch(uuid,text) cascade;
drop function if exists public.mentorship_require_staff(text) cascade;
drop function if exists public.mentorship_review_json(public.mentorship_review,boolean) cascade;
drop function if exists public.mentorship_review_url(jsonb,text) cascade;
drop function if exists public.mentorship_safe_uuid(text) cascade;
drop function if exists public.mentorship_save_mentor(jsonb) cascade;
drop function if exists public.mentorship_save_student(text,text,text) cascade;
drop function if exists public.mentorship_scores(jsonb) cascade;
drop function if exists public.mentorship_set_checklist(uuid,text,boolean,text) cascade;
drop function if exists public.mentorship_short_name(text) cascade;
drop function if exists public.mentorship_staff_json(uuid) cascade;
drop function if exists public.mentorship_stage_required(text) cascade;
drop function if exists public.mentorship_student_match(uuid) cascade;
drop function if exists public.mentorship_submit_application() cascade;
drop function if exists public.mentorship_submit_pulse(uuid,integer,text,boolean,integer,text) cascade;
drop function if exists public.mentorship_submit_quiz(jsonb) cascade;
drop function if exists public.mentorship_submit_review(uuid,integer,text[],text,boolean,text) cascade;
drop function if exists public.mentorship_switch_json(uuid) cascade;
drop function if exists public.mentorship_tier(text) cascade;
drop function if exists public.mentorship_trg_match_mail() cascade;
drop function if exists public.mentorship_trg_mentor_mail() cascade;
drop function if exists public.mentorship_trg_review_stats() cascade;
drop function if exists public.mentorship_trg_touch() cascade;
drop function if exists public.mentorship_txt(jsonb,integer,text) cascade;
drop function if exists public.mentorship_unmatched_list(text) cascade;
drop function if exists public.mentorship_url(jsonb,text,boolean) cascade;
drop function if exists public.mentorship_vocab(text) cascade;
drop function if exists public.mentorship_week_no(timestamp with time zone,timestamp with time zone) cascade;
drop function if exists public.mentorship_whoami() cascade;
drop function if exists public.mentorship_ym(jsonb,text) cascade;

-- Ask PostgREST (the Supabase API) to pick up the new or removed functions right away.
notify pgrst, 'reload schema';

commit;

do $$
begin
  raise notice 'mentorship rollback done. Storage buckets mentorship-photos and mentorship-cv were kept, '
               'with any uploaded photos and CVs. Delete them in Supabase Storage if they are no longer needed.';
end
$$;
