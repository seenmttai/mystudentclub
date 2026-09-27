-- Career intake is separate per verified account and program category.
-- Anonymous submissions can only be written, never enumerated or read back.
BEGIN;

-- Abort with a readable error before any DDL if the existing app schema differs.
DO $$
DECLARE missing_columns text;
BEGIN
  SELECT string_agg(expected.table_name || '.' || expected.column_name, ', ' ORDER BY expected.table_name,expected.column_name)
    INTO missing_columns
  FROM (VALUES
    ('profiles','uuid'),('profiles','profile'),('profiles','looking_for'),('profiles','updated_at'),
    ('resource_access_logs','name'),('resource_access_logs','email'),('resource_access_logs','phone'),
    ('resource_access_logs','program_type'),('resource_access_logs','program_display'),
    ('resource_access_logs','resource_title'),('resource_access_logs','resource_url'),('resource_access_logs','accessed_at'),
    ('consentform','user_id'),('consentform','cv_sharing_consent'),('consentform','consent_text'),
    ('consentform','consented_at'),('consentform','withdrawn_at'),('consentform','updated_at'),('consentform','user_agent')
  ) AS expected(table_name,column_name)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=expected.table_name AND c.column_name=expected.column_name);
  IF missing_columns IS NOT NULL THEN RAISE EXCEPTION 'Career intake requires existing app columns: %',missing_columns; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='consentform' AND column_name='cv_sharing_consent' AND data_type='boolean') THEN RAISE EXCEPTION 'consentform.cv_sharing_consent must be boolean'; END IF;
END;
$$;

create table if not exists public.career_intakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  stage text not null check (stage in ('experienced-ca','ca-fresher','industrial-training','articleship','semi-qualified','other')),
  details jsonb not null,
  source jsonb not null default '{}'::jsonb,
  consent_version text not null,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,stage)
);
alter table public.career_intakes enable row level security;
drop policy if exists career_intakes_read_own on public.career_intakes;
create policy career_intakes_read_own on public.career_intakes for select to authenticated using (user_id = auth.uid());
revoke all on public.career_intakes from anon, authenticated;
grant select on public.career_intakes to authenticated;

-- SECURITY DEFINER deliberately has no caller-supplied user id; auth.uid() owns each write.
create or replace function public.submit_career_intake(p_stage text,p_details jsonb,p_source jsonb default '{}'::jsonb)
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
  if coalesce((v_details->>'sharing_consent')::boolean,false) is not true or coalesce(v_details->>'consent_version','') <> '2026-09-27' then raise exception 'Explicit consent is required'; end if;
  if v_uid is not null then
    select email into v_email from auth.users where id=v_uid;
    v_details := jsonb_set(v_details,'{email}',to_jsonb(v_email));
  end if;
  if length(trim(coalesce(v_details->>'name',''))) < 1 or length(v_details->>'name') > 160
     or coalesce(v_details->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or coalesce(v_details->>'phone','') !~ '^[+0-9 ()-]{10,20}$'
     or length(regexp_replace(coalesce(v_details->>'phone',''),'[^0-9]','','g')) not between 10 and 15 then raise exception 'Name, email and phone are required'; end if;
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
  v_details := v_details || jsonb_build_object('stage',p_stage,'consent_at',now(),'consent_text','I confirm that my details are correct and agree to My Student Club sharing my profile with recruiters and sending me relevant opportunities and updates via email.');
  insert into public.career_intakes(user_id,stage,details,source,consent_version,consent_at)
    values(v_uid,p_stage,v_details,p_source,'2026-09-27',now())
    on conflict(user_id,stage) do update set details=excluded.details,source=excluded.source,consent_version=excluded.consent_version,consent_at=excluded.consent_at,updated_at=now();
  if p_source->>'kind'='resource' then
    insert into public.resource_access_logs(name,email,phone,program_type,program_display,resource_title,resource_url,accessed_at)
      values(v_details->>'name',v_details->>'email',v_details->>'phone',p_stage,
        case p_stage when 'ca-fresher' then 'CA Fresher Training' when 'industrial-training' then 'CA Industrial Training' when 'articleship' then 'CA Articleship' when 'semi-qualified' then 'Semi Qualified CA' else p_stage end,
        coalesce(p_source->>'title','Resource'),coalesce(p_source->>'url',''),now());
  end if;
  if v_uid is not null then
    -- Merge only into this member's existing JSON profile; retain CVs and all unrelated fields.
    select coalesce(profile::jsonb,'{}'::jsonb) into v_profile from public.profiles where uuid::text=v_uid::text for update;
    v_profile := coalesce(v_profile,'{}'::jsonb);
    v_portal := case p_stage when 'experienced-ca' then 'fresher_experienced' when 'ca-fresher' then 'fresher_fresher' when 'industrial-training' then 'industrial' when 'articleship' then 'articleship' when 'semi-qualified' then case when v_details->>'experience_type'='fresher' then 'semi_fresher' else 'semi_experienced' end else '' end;
    v_profile := v_profile || jsonb_build_object('name',v_details->>'name','email',v_details->>'email','contact_number',v_details->>'phone','career_intake',v_details,'recruiter_sharing_consent',true,'cv_sharing_consent',true,'marketing_email_consent',true,'career_intake_consent_at',now());
    v_patch := v_patch || jsonb_build_object('email_id',v_details->>'email','mobile_number',v_details->>'phone');
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
    -- This is the consent record consumed by the existing recruiter search and profile privacy UI.
    insert into public.consentform(user_id,cv_sharing_consent,consent_text,consented_at,withdrawn_at,updated_at,user_agent)
      values(v_uid,true,v_details->>'consent_text',now(),null,now(),left(coalesce(p_source->>'user_agent','MSC career intake'),500))
      on conflict(user_id) do update set cv_sharing_consent=true,consent_text=excluded.consent_text,
        consented_at=excluded.consented_at,withdrawn_at=null,updated_at=excluded.updated_at,user_agent=excluded.user_agent;

  end if;
  return jsonb_build_object('saved',true,'stage',p_stage);
end;
$$;
revoke all on function public.submit_career_intake(text,jsonb,jsonb) from public;
grant execute on function public.submit_career_intake(text,jsonb,jsonb) to anon, authenticated;

COMMIT;
