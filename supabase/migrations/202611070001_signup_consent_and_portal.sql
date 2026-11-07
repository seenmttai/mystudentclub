-- Sign-up consent and the portal popup after signup.
--
-- 1. signup_consents: one row per account with the sign-up promotional-emails tick-box, the exact wording shown and
--    the server time. New table; nothing else reads or writes it.
-- 2. record_signup_consent(): records that box once and sets profiles.profile.marketing_email_consent, the flag the
--    mail worker reads. Recruiter sharing is not asked at sign-up: the site asks for it when a CV is uploaded.
-- 3. submit_signup_career_intake(): saves the portal popup answers. Generated from submit_career_intake with the same
--    stage validation and profile mapping, but it needs no consent box or phone number, writes no resource log and no
--    consent, and never replaces a category the student already completed through a resource form.
--
-- Additive: no existing table is altered and submit_career_intake (resource forms) is untouched.
-- Reversible: drop function public.submit_signup_career_intake(text,jsonb,jsonb);
--             drop function public.record_signup_consent(boolean,text);
--             drop table public.signup_consents;
-- (The marketing flag already written into profiles stays, like any other consent answer.)
BEGIN;

create table if not exists public.signup_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  promotional_consent boolean not null,
  consent_version text not null,
  promotional_text text not null,
  recorded_at timestamptz not null default now()
);
alter table public.signup_consents enable row level security;
drop policy if exists signup_consents_read_own on public.signup_consents;
create policy signup_consents_read_own on public.signup_consents for select to authenticated using (user_id = auth.uid());
revoke all on public.signup_consents from anon, authenticated;
grant select on public.signup_consents to authenticated;

-- The promotional-emails tick-box on the sign-up page. Server time and the exact wording are recorded; the browser only says
-- whether the box was ticked and which wording version it showed. Recruiter sharing is NOT asked at sign-up: the site
-- asks for it when a CV is uploaded (portal3.js prompt, profile toggle), so this function never touches consentform.
create or replace function public.record_signup_consent(p_promotional boolean,p_version text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_promotional boolean := coalesce(p_promotional,false);
  v_promotional_text constant text := 'Email me about new batches, events, updates and offers.';
  v_profile jsonb;
begin
  if v_uid is null then raise exception 'Sign in to record consent'; end if;
  if p_version is distinct from '2026-11-07' then raise exception 'Unknown consent version'; end if;
  -- First answer wins: a later call (a retry, another device) never changes what was recorded.
  insert into public.signup_consents(user_id,promotional_consent,consent_version,promotional_text,recorded_at)
    values(v_uid,v_promotional,p_version,v_promotional_text,now())
    on conflict(user_id) do nothing;
  if not found then return jsonb_build_object('recorded',false,'reason','already_recorded'); end if;
  -- marketing_email_consent is the flag the mail worker reads; profile saves keep it.
  select coalesce(profile::jsonb,'{}'::jsonb) into v_profile from public.profiles where uuid::text=v_uid::text for update;
  v_profile := coalesce(v_profile,'{}'::jsonb) || jsonb_build_object('marketing_email_consent',v_promotional);
  insert into public.profiles(uuid,profile,updated_at) values(v_uid,v_profile,now())
    on conflict(uuid) do update set profile=excluded.profile,updated_at=excluded.updated_at;
  return jsonb_build_object('recorded',true,'promotional',v_promotional);
end;
$$;
revoke all on function public.record_signup_consent(boolean,text) from public;
grant execute on function public.record_signup_consent(boolean,text) to authenticated;

create or replace function public.submit_signup_career_intake(p_stage text,p_details jsonb,p_source jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_details jsonb := p_details;
  v_email text;
  v_year integer;
  v_month text;
  v_profile jsonb;
  v_portal text;
  v_looking_for text;
  v_attempt_label text;
  v_short_month text;
  v_years numeric;
  v_patch jsonb := '{}'::jsonb;
  v_column record;
begin
  if p_stage is null or p_stage not in ('experienced-ca','ca-fresher','industrial-training','articleship','semi-qualified','other') then raise exception 'Invalid career stage'; end if;
  -- Signup portal answers: consent was given on the sign-up page (record_signup_consent), and phone is not asked.
  if v_uid is null then raise exception 'Sign in to save your career details'; end if;
  if v_uid is not null then
    select email into v_email from auth.users where id=v_uid;
    v_details := jsonb_set(v_details,'{email}',to_jsonb(v_email));
  end if;
  if length(coalesce(v_details->>'name','')) > 160
     or coalesce(v_details->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A valid account email is required'; end if;
  -- Never take a phone number or consent fields from this path.
  v_details := v_details - 'phone' - 'sharing_consent' - 'consent_text' - 'consent_at' - 'consent_version';
  if p_stage in ('experienced-ca','ca-fresher','industrial-training','articleship') then
    v_year := (v_details->>'attempt_year')::integer;
    v_month := v_details->>'attempt_month';
    if v_year is null or v_month is null or v_year > 2050 or v_year < (case when p_stage='experienced-ca' then 1950 else 2024 end) then raise exception 'Invalid exam year'; end if;
    if (p_stage='articleship' and v_month not in ('May','September','January'))
      or (p_stage in ('ca-fresher','industrial-training') and v_month not in ('May','November'))
      or (p_stage='experienced-ca' and v_month not in ('January','February','March','April','May','June','July','August','September','October','November','December')) then raise exception 'Invalid exam month'; end if;
  end if;
  if p_stage='ca-fresher' and coalesce(v_details->>'status','') not in ('Qualified','Result Awaited','Yet to Appear') then raise exception 'Current status is required'; end if;
  if p_stage='articleship' and coalesce(v_details->>'status','') not in ('Cleared CA Intermediate Both Groups','Cleared one group','Results Awaited','Yet to Appear the Exams') then raise exception 'Current status is required'; end if;
  if p_stage='semi-qualified' and coalesce(v_details->>'status','') not in ('Awaiting Results','Yet to Appear','Paused','Discontinued CA studies') then raise exception 'Current status is required'; end if;
  if p_stage in ('experienced-ca','industrial-training','semi-qualified') then
    if nullif(v_details->>'earliest_joining_date','') is null then raise exception 'Joining date is required'; end if;
    if (v_details->>'earliest_joining_date')::date not between date '2024-01-01' and date '2050-12-31' then raise exception 'Invalid joining date'; end if;
  end if;
  if p_stage='industrial-training' then
    if nullif(v_details->>'industrial_training_eligibility_date','') is null then raise exception 'Eligibility date is required'; end if;
    if (v_details->>'industrial_training_eligibility_date')::date not between date '2024-01-01' and date '2050-12-31' then raise exception 'Invalid eligibility date'; end if;
  end if;
  if p_stage='semi-qualified' and coalesce(v_details->>'experience_type','') not in ('fresher','other') then raise exception 'Experience is required'; end if;
  if p_stage='experienced-ca' or (p_stage='semi-qualified' and v_details->>'experience_type'='other') then
    if nullif(v_details->>'experience_years','') is null or nullif(v_details->>'experience_months','') is null
       or (v_details->>'experience_years')::integer not between 0 and 60 or (v_details->>'experience_months')::integer not between 0 and 11 then raise exception 'Invalid experience'; end if;
  end if;
  if p_stage='other' and length(trim(coalesce(v_details->>'other_stage',''))) = 0 then raise exception 'Career stage description is required'; end if;
  -- Record the server time and exact disclosure rather than trusting client timestamps/text.
  v_details := v_details || jsonb_build_object('stage',p_stage,'collected_via','signup','collected_at',now());
  -- A category the student already completed with consent (a resource form) is never replaced by signup answers.
  if exists(select 1 from public.career_intakes where user_id=v_uid and stage=p_stage and consent_version<>'signup') then
    return jsonb_build_object('saved',true,'stage',p_stage,'kept_existing',true);
  end if;
  insert into public.career_intakes(user_id,stage,details,source,consent_version,consent_at)
    values(v_uid,p_stage,v_details,p_source,'signup',now())
    on conflict(user_id,stage) do update set details=excluded.details,source=excluded.source,updated_at=now()
      where public.career_intakes.consent_version='signup';
  if v_uid is not null then
    -- Merge only into this member's existing JSON profile; retain CVs and all unrelated fields.
    select coalesce(profile::jsonb,'{}'::jsonb) into v_profile from public.profiles where uuid::text=v_uid::text for update;
    v_profile := coalesce(v_profile,'{}'::jsonb);
    v_portal := case p_stage when 'experienced-ca' then 'fresher_experienced' when 'ca-fresher' then 'fresher_fresher' when 'industrial-training' then 'industrial' when 'articleship' then 'articleship' when 'semi-qualified' then case when v_details->>'experience_type'='fresher' then 'semi_fresher' else 'semi_experienced' end else '' end;
    -- Name and email only when present; never a phone and never consent flags (those come from record_signup_consent).
    v_profile := v_profile || jsonb_strip_nulls(jsonb_build_object('name',nullif(trim(coalesce(v_details->>'name','')),''),'email',v_details->>'email')) || jsonb_build_object('career_intake',v_details);
    v_patch := v_patch || jsonb_build_object('email_id',v_details->>'email');
    if v_portal <> '' then v_profile := v_profile || jsonb_build_object('portal_type',v_portal,'job_preference',v_portal); end if;
    if v_details ? 'earliest_joining_date' then
      v_profile := v_profile || jsonb_build_object('earliest_joining_date',v_details->>'earliest_joining_date');
      v_patch := v_patch || jsonb_build_object('earliest_joining_date',v_details->>'earliest_joining_date');
    end if;
    v_short_month := left(v_month,3);
    v_attempt_label := v_month || ' ' || v_year::text;
    if p_stage='articleship' then
      v_profile := v_profile || jsonb_build_object('ca_inter_app_month',v_short_month,'ca_inter_app_year',v_year::text,'ca_inter_attempt',v_attempt_label,
        'ca_inter_status',case v_details->>'status' when 'Cleared CA Intermediate Both Groups' then 'Both Groups Cleared' when 'Cleared one group' then 'One Group Cleared' when 'Results Awaited' then 'Result Awaited' else 'Yet to Appear' end);
      v_patch := v_patch || jsonb_build_object('ca_inter_attempt',v_attempt_label);
      if v_details->>'status'='Cleared CA Intermediate Both Groups' then v_profile := v_profile || jsonb_build_object('ca_inter_course','CA Inter (Both Groups)','ca_inter_clear_month',v_short_month,'ca_inter_clear_year',v_year::text); end if;
    end if;
    if p_stage in ('ca-fresher','experienced-ca','industrial-training') then
      v_profile := v_profile || jsonb_build_object('ca_final_app_month',v_short_month,'ca_final_app_year',v_year::text,'ca_final_attempt',v_attempt_label,
        'ca_final_status',case when p_stage='experienced-ca' then 'Qualified' when p_stage='industrial-training' then 'Appearing' else v_details->>'status' end);
      v_patch := v_patch || jsonb_build_object('ca_final_attempt',v_attempt_label);
    end if;
    if p_stage='industrial-training' then
      v_profile := v_profile || jsonb_build_object('industrial_training_eligibility_date',v_details->>'industrial_training_eligibility_date','articleship_1yr_end_date',v_details->>'industrial_training_eligibility_date');
      v_patch := v_patch || jsonb_build_object('articleship_1yr_end_date',v_details->>'industrial_training_eligibility_date');
    end if;
    if p_stage='experienced-ca' or (p_stage='ca-fresher' and v_details->>'status'='Qualified') then v_profile := v_profile || jsonb_build_object('ca_final_clear_month',v_short_month,'ca_final_clear_year',v_year::text,'ca_final_course','CA Final (Both Groups)','ca_final_groups_cleared','Both'); end if;
    if p_stage in ('experienced-ca','semi-qualified') then
      v_years := round(coalesce(nullif(v_details->>'experience_years',''),'0')::numeric + coalesce(nullif(v_details->>'experience_months',''),'0')::numeric / 12,4);
      v_profile := v_profile || jsonb_build_object('emp_exp_years',coalesce(v_details->>'experience_years','0'),'emp_exp_months',coalesce(v_details->>'experience_months','0'),'total_experience',v_years::text,'years_of_experience',v_years::text);
      v_patch := v_patch || jsonb_build_object('years_of_experience',v_years);
      if p_stage='semi-qualified' then v_profile := v_profile || jsonb_build_object('ca_final_status',case v_details->>'status' when 'Awaiting Results' then 'Result Awaited' when 'Yet to Appear' then 'Yet to Appear' else 'Not Pursuing' end); end if;
    end if;
    v_looking_for := case p_stage when 'industrial-training' then 'CA Industrial Training Default' when 'articleship' then 'CA Articleship' when 'ca-fresher' then 'CA Freshers' when 'experienced-ca' then 'CA Fresher (Experienced)' when 'semi-qualified' then 'Semi Qualified CA' else null end;
    insert into public.profiles(uuid,profile,looking_for,updated_at) values(v_uid,v_profile,v_looking_for,now())
      on conflict(uuid) do update set profile=excluded.profile,looking_for=coalesce(excluded.looking_for,public.profiles.looking_for),updated_at=excluded.updated_at;
    -- Existing recruiter views consume these columns; adapt to actual catalog types.
    -- Never put an exam month/year into a numeric attempt-count column.
    for v_column in
      select a.attname,t.typcategory,t.typname
      from pg_attribute a join pg_type t on t.oid=a.atttypid
      where a.attrelid='public.profiles'::regclass and a.attnum>0 and not a.attisdropped
        and v_patch ? a.attname
    loop
      if (v_column.attname in ('ca_inter_attempt','ca_final_attempt','email_id','mobile_number') and v_column.typcategory='S')
         or (v_column.attname in ('articleship_1yr_end_date','earliest_joining_date') and v_column.typcategory in ('S','D'))
         or (v_column.attname='years_of_experience' and v_column.typcategory in ('S','N')) then
        if v_column.attname='years_of_experience' and v_column.typname in ('int2','int4','int8') then
          -- An integer legacy column represents completed years; exact months remain in JSON.
          v_patch := jsonb_set(v_patch,'{years_of_experience}',to_jsonb(floor(v_years)));
        end if;
        execute format('update public.profiles set %1$I = (jsonb_populate_record(null::public.profiles,$1)).%1$I where uuid::text=$2',v_column.attname)
          using jsonb_build_object(v_column.attname,v_patch->v_column.attname),v_uid::text;
      end if;
    end loop;

  end if;
  return jsonb_build_object('saved',true,'stage',p_stage);
end;
$$;
revoke all on function public.submit_signup_career_intake(text,jsonb,jsonb) from public;
grant execute on function public.submit_signup_career_intake(text,jsonb,jsonb) to authenticated;

COMMIT;
