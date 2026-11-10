-- One location style on every job table: the city (6 Nov 2026).
--
-- Vacancies said "Noida" next to "Hyderabad, Telangana, India", "Bengaluru, Karnataka, India (On-site)",
-- "Bangalore", "Gurgaon", "gurgaon", "Mumbai Metropolitan Region"... (about 7,500 spellings across 65k rows).
-- public.msc_clean_location() keeps just the place:
--   * drops ", India", Indian state / UT names and "(On-site)" / "(Hybrid)"
--   * one name per city: Bangalore = Bengaluru, Gurgaon = Gurugram, Bombay = Mumbai, New Delhi = Delhi, ...
--   * region wording: "Greater Hyderabad Area", "Mumbai Metropolitan Region", "Pune Division", "Bengaluru East" = the city
--   * "India (Remote)" / "Remote (India)" = "Remote"; "Bengaluru, Karnataka, India (Remote)" = "Bengaluru, Remote"
--   * "Delhi / NCR" = "Delhi NCR"; "India" alone stays "India"
--   * several cities stay several cities ("Mumbai, Pune"), each cleaned, duplicates dropped
--   * a state named on its own stays ("Maharashtra, India" = "Maharashtra"); unknown places are kept as written
-- A trigger cleans every new or edited vacancy, whoever posts it (admin panel, hire.msc, posters, bots).
--
-- Not destructive: the old values are copied to public.job_location_backup_20261106 first.
-- Undo:
--   update "<table>" t set "Location" = b.location from job_location_backup_20261106 b
--    where b.table_name = '<table>' and b.row_id = t.id::text;            -- for each of the 4 tables
--   drop trigger job_location_clean_trg on "<table>";                       -- for each of the 4 tables
--   drop function public.job_location_clean_trg(); drop function public.msc_clean_location(text);
-- Before running: check the 4 tables' update triggers (select tgname, tgrelid::regclass from pg_trigger where not
-- tgisinternal and tgrelid in (...)) so the one-time update doesn't fire notifications.

create or replace function public.msc_clean_location(raw text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
  part text;
  low text;
  parts text[] := '{}';
  out_parts text[] := '{}';
  remote boolean := false;
  states text[] := array[
    'andhra pradesh','arunachal pradesh','assam','bihar','chhattisgarh','goa','gujarat','haryana','himachal pradesh',
    'jharkhand','karnataka','kerala','madhya pradesh','maharashtra','manipur','meghalaya','mizoram','nagaland','odisha',
    'orissa','punjab','rajasthan','sikkim','tamil nadu','telangana','tripura','uttar pradesh','uttarakhand',
    'west bengal','andaman and nicobar islands','dadra and nagar haveli and daman and diu','jammu and kashmir',
    'ladakh','lakshadweep','puducherry','pondicherry','up','mp','tn'];
  dropped_state text := null;
begin
  if raw is null then return null; end if;
  s := btrim(regexp_replace(raw, '\s+', ' ', 'g'));
  if s = '' then return raw; end if;

  -- work mode
  if s ~* '\y(remote|work from home|wfh)\y' then remote := true; end if;
  s := regexp_replace(s, '\(\s*(on-?site|hybrid|remote|work from office|wfo)\s*\)', ' ', 'gi');
  s := regexp_replace(s, '^\s*(hybrid|on-?site|remote)\s*[-:|]\s*', '', 'i');
  s := regexp_replace(s, '\s*[-|]\s*(hybrid|on-?site)\s*$', '', 'i');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'), ' ,');

  if lower(s) in ('remote', 'india remote', 'remote india', 'india (remote)', 'remote (india)', 'remote, india', 'india, remote', 'work from home', 'wfh', '') then
    return case when remote then 'Remote' else raw end;
  end if;

  -- "Delhi / NCR", "Delhi/NCR", "Delhi-NCR" before splitting on "/"
  s := regexp_replace(s, '\ydelhi\s*[/-]?\s*ncr\y', 'Delhi NCR', 'gi');
  -- "Pune/Pimpri-Chinchwad Area"
  s := regexp_replace(s, '\ypune\s*/\s*pimpri[- ]chinchwad( area)?\y', 'Pune', 'gi');

  s := regexp_replace(s, '\yjammu\s*(&|and)\s*kashmir\y', 'Jammu and Kashmir', 'gi');
  parts := regexp_split_to_array(s, '\s*[,/|;]\s*|\s+&\s+');
  foreach part in array parts loop
    part := btrim(part, ' .-');
    continue when part = '';
    low := lower(part);
    if low in ('india', 'in', 'ind', 'bharat') then continue; end if;
    if low = any(states) then dropped_state := coalesce(dropped_state, part); continue; end if;

    -- region wording
    low := regexp_replace(low, '^greater (.+) area$', '\1');
    -- region wording after a major city only ("Salt Lake City" stays)
    low := regexp_replace(low, '^(mumbai|pune|bengaluru|bangalore|hyderabad|chennai|kolkata|delhi|new delhi|ahmedabad|noida|gurugram|gurgaon|jaipur|lucknow|indore|nagpur|surat|kochi|thane|vadodara|coimbatore|bhopal|chandigarh|mohali|ludhiana|raipur)\s+(metropolitan region|division|district|city|urban|rural|suburban|east|west|north|south|area)$', '\1');
    low := regexp_replace(low, '\s*\(all areas\)$', '');
    low := regexp_replace(low, '^(south|north|east|west|central) delhi$', 'delhi');
    low := btrim(low);
    continue when low = '';

    -- one name per city
    low := case low
      when 'bangalore' then 'bengaluru' when 'bengaluru' then 'bengaluru'
      when 'gurgaon' then 'gurugram'
      when 'bombay' then 'mumbai'
      when 'calcutta' then 'kolkata'
      when 'madras' then 'chennai'
      when 'new delhi' then 'delhi'
      when 'baroda' then 'vadodara'
      when 'cochin' then 'kochi' when 'ernakulam' then 'kochi'
      when 'mysore' then 'mysuru'
      when 'mangalore' then 'mangaluru'
      when 'trivandrum' then 'thiruvananthapuram'
      when 'sahibzada ajit singh nagar' then 'mohali' when 'sas nagar' then 'mohali'
      when 'pan india' then 'pan india'
      else low end;

    if low = 'delhi ncr' or low = 'ncr' then part := 'Delhi NCR';
    elsif low = 'pan india' then part := 'Pan India';
    elsif low = 'remote' then remote := true; continue;
    elsif low in ('uae', 'usa', 'us', 'uk', 'ksa') then
      part := upper(low);                        -- country codes stay in capitals
    elsif part ~ '[A-Z]' and part ~ '[a-z]' and lower(part) = low then
      part := part;                              -- already mixed case and unchanged: keep as written
    else
      part := initcap(low);
    end if;
    if not (part = any(out_parts)) then out_parts := out_parts || part; end if;
  end loop;

  if array_length(out_parts, 1) is null then
    if remote then return 'Remote'; end if;
    if dropped_state is not null then return initcap(lower(dropped_state)); end if;
    return 'India';
  end if;
  if remote and not ('Remote' = any(out_parts)) then out_parts := out_parts || 'Remote'::text; end if;
  return array_to_string(out_parts, ', ');
end;
$$;

create or replace function public.job_location_clean_trg()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new."Location" is distinct from old."Location" then
    new."Location" := public.msc_clean_location(new."Location");
  end if;
  return new;
end;
$$;

-- Backup of every value the one-time clean changes (kept until someone drops it).
create table if not exists public.job_location_backup_20261106 (
  table_name text not null,
  row_id text not null,
  location text,
  primary key (table_name, row_id)
);
alter table public.job_location_backup_20261106 enable row level security;
revoke all on public.job_location_backup_20261106 from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['Industrial Training Job Portal', 'Articleship Jobs', 'Fresher Jobs', 'Semi Qualified Jobs'] loop
    execute format('drop trigger if exists job_location_clean_trg on public.%I', t);
    execute format('create trigger job_location_clean_trg before insert or update of "Location" on public.%I '
                   'for each row execute function public.job_location_clean_trg()', t);
    execute format('insert into public.job_location_backup_20261106 (table_name, row_id, location) '
                   'select %L, id::text, "Location" from public.%I '
                   'where "Location" is distinct from public.msc_clean_location("Location") '
                   'on conflict do nothing', t, t);
    execute format('update public.%I set "Location" = public.msc_clean_location("Location") '
                   'where "Location" is distinct from public.msc_clean_location("Location")', t);
  end loop;
end;
$$;
