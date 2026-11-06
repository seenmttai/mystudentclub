-- Structured vacancy filters (Aniket, 6 Nov 2026).
--
-- Adds filter columns to the four job tables and a BEFORE INSERT/UPDATE trigger that reads each
-- vacancy's Description, Company, Location, Salary and apply details and fills them. The trigger
-- fills only columns that are still empty, so a poster (admin, hire.msc, a script) can set any of
-- them explicitly and it will be kept. It never touches existing columns except
-- "Semi Qualified Jobs".yoe / "Fresher Jobs".yoe, and only when they are empty.
--
-- Every value is derived from data already in the row, so nothing new is exposed: the anon role
-- gets SELECT on the new columns only, exactly like the public columns the portal reads today.
--
-- A parser bug can never block a job from being posted: the extraction runs inside an exception
-- block that logs a warning and leaves the row as it was.
--
-- Reversible: yes. Reverse SQL (drops only what this file adds):
--   drop trigger if exists job_filter_fill on "Articleship Jobs";
--   drop trigger if exists job_filter_fill on "Industrial Training Job Portal";
--   drop trigger if exists job_filter_fill on "Fresher Jobs";
--   drop trigger if exists job_filter_fill on "Semi Qualified Jobs";
--   drop function if exists public.job_filter_fill(), public.job_filter_patch(text, jsonb), public.job_filter_keys(),
--     public.job_filter_extract(text, jsonb),
--     public.job_filter_months(text), public.job_filter_company_key(text),
--     public.job_filter_safe_date(int, int, int), public.job_filter_month_no(text);
--   alter table <each table> drop column if exists <each column added below>;
--   ("Semi Qualified Jobs".yoe is new here; "Fresher Jobs".yoe is older and must be kept.)
--
-- Backfill of existing rows: 202611060002_job_filter_fields_backfill.sql (run after this file).

-- ---------------------------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------------------------

alter table "Articleship Jobs"
  add column if not exists pay_min integer,
  add column if not exists pay_max integer,
  add column if not exists apply_methods text[],
  add column if not exists deadline date,
  add column if not exists company_key text,
  add column if not exists is_pan_india boolean,
  add column if not exists work_mode text,
  add column if not exists immediate_joining boolean,
  add column if not exists inter_requirement text,
  add column if not exists itt_oc_required boolean,
  add column if not exists transfer_accepted boolean,
  add column if not exists firm_size text,
  add column if not exists exposure_areas text[],
  add column if not exists client_types text[],
  add column if not exists outstation_audits boolean,
  add column if not exists working_days integer;

alter table "Industrial Training Job Portal"
  add column if not exists pay_min integer,
  add column if not exists pay_max integer,
  add column if not exists apply_methods text[],
  add column if not exists deadline date,
  add column if not exists company_key text,
  add column if not exists is_pan_india boolean,
  add column if not exists work_mode text,
  add column if not exists immediate_joining boolean,
  add column if not exists joining_month date,
  add column if not exists attempt_from date,
  add column if not exists attempt_to date,
  add column if not exists duration_min_months integer,
  add column if not exists duration_max_months integer,
  add column if not exists exam_criteria text[],
  add column if not exists employer_type text,
  add column if not exists tools text[];

alter table "Fresher Jobs"
  add column if not exists pay_min integer,
  add column if not exists pay_max integer,
  add column if not exists apply_methods text[],
  add column if not exists deadline date,
  add column if not exists company_key text,
  add column if not exists is_pan_india boolean,
  add column if not exists work_mode text,
  add column if not exists immediate_joining boolean,
  add column if not exists notice_days integer,
  add column if not exists attempt_from date,
  add column if not exists attempt_to date,
  add column if not exists exam_criteria text[],
  add column if not exists employer_type text,
  add column if not exists work_types text[],
  add column if not exists shift text,
  add column if not exists tools text[],
  add column if not exists pqe_required boolean;

alter table "Semi Qualified Jobs"
  add column if not exists pay_min integer,
  add column if not exists pay_max integer,
  add column if not exists apply_methods text[],
  add column if not exists deadline date,
  add column if not exists company_key text,
  add column if not exists is_pan_india boolean,
  add column if not exists work_mode text,
  add column if not exists immediate_joining boolean,
  add column if not exists notice_days integer,
  add column if not exists employer_type text,
  add column if not exists work_types text[],
  add column if not exists shift text,
  add column if not exists tools text[],
  add column if not exists working_days integer,
  add column if not exists yoe integer;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create or replace function public.job_filter_month_no(m text) returns integer
language sql immutable as $$
  select array_position(array['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'], left(lower(m), 3))
$$;

create or replace function public.job_filter_safe_date(y integer, m integer, d integer) returns date
language plpgsql immutable as $$
begin
  if y is null or m is null or d is null then return null; end if;
  if y < 100 then y := 2000 + y; end if;
  return make_date(y, m, d);
exception when others then
  return null;
end $$;

-- Every "Month YYYY" / "Month'YY" in a text, as the first day of that month, sorted, distinct.
create or replace function public.job_filter_months(t text) returns date[]
language sql immutable as $$
  select coalesce(array_agg(distinct make_date(
           case when m[2] like '''%' then 2000 + substr(m[2], 2)::int else m[2]::int end,
           public.job_filter_month_no(m[1]), 1)), '{}')
  from regexp_matches(coalesce(t, ''),
    '\m(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[ ,/-]*(20[23][0-9]|''[23][0-9])(?![0-9])',
    'gi') m
$$;

-- One key per employer, so "EY", "EY India" and "EY GDS" are the same company.
-- Mirrored by normalizeCompanyKey() in scripts/job-filters.js (tests keep them in step).
create or replace function public.job_filter_company_key(name text) returns text
language plpgsql immutable as $$
declare k text := lower(coalesce(name, ''));
begin
  k := regexp_replace(k, '\([^)]*\)', ' ', 'g');
  k := replace(k, '&', ' and ');
  k := regexp_replace(k, '[^a-z0-9 ]+', ' ', 'g');
  k := btrim(regexp_replace(k, '\s+', ' ', 'g'));
  k := regexp_replace(k, '^the ', '');
  if k ~ '^(ey|ernst and young)( |$)' then return 'ey'; end if;
  if k ~ '^deloitte( |$)' then return 'deloitte'; end if;
  if k ~ '^kpmg( |$)' then return 'kpmg'; end if;
  if k ~ '^(pwc|pricewaterhousecoopers|price waterhouse)( |$)' then return 'pwc'; end if;
  if k ~ '^accenture( |$)' then return 'accenture'; end if;
  if k ~ '^grant thornton( |$)' then return 'grant thornton'; end if;
  if k ~ '^bdo( |$)' then return 'bdo'; end if;
  k := regexp_replace(k, '( (private|pvt|limited|ltd|llp|inc|plc|and co|co|and company|company|india|in india|gds|usi|global services|chartered accountants|and associates|associates))+$', '');
  k := btrim(k);
  return nullif(k, '');
end $$;

-- ---------------------------------------------------------------------------------------------
-- The extractor: one row (as jsonb) in, a jsonb of filter values out. Keys that are not columns of
-- the table are ignored by the trigger (jsonb_populate_record), so one function serves all tables.
-- ---------------------------------------------------------------------------------------------

create or replace function public.job_filter_extract(tbl text, r jsonb) returns jsonb
language plpgsql stable as $$
declare
  d text := lower(coalesce(r->>'Description', ''));
  dr text;
  co text := lower(coalesce(r->>'Company', ''));
  loc text := lower(coalesce(r->>'Location', ''));
  appid text := lower(coalesce(r->>'Application ID', ''));
  ctype text := btrim(coalesce(r->>'Company Type', ''));
  created date;
  annual boolean := tbl in ('Fresher Jobs', 'Semi Qualified Jobs');
  out jsonb := '{}'::jsonb;
  arr text[];
  w text;
  ln text;
  m text[];
  n numeric;
  v numeric;
  vals numeric[] := '{}';
  months date[];
  all_months date[] := '{}';
  lo date;
  hi date;
  later boolean := false;
  earlier boolean := false;
  open_ended boolean := false;
  i integer;
  j integer;
  monthly_line boolean;
  has_currency boolean;
begin
  begin
    created := (r->>'Created_At')::timestamptz::date;
  exception when others then
    created := null;
  end;
  created := coalesce(created, current_date);

  d := regexp_replace(d, '[–—−]', '-', 'g');
  d := regexp_replace(d, '[’‘`]', '''', 'g');
  d := regexp_replace(d, '[*_]{1,3}', '', 'g');   -- markdown bold/italics
  d := replace(d, chr(160), ' ');
  -- "9-12 months" / "5 to 8 years" become "9_12 months" / "5_8 years", so a range reads as one token.
  dr := regexp_replace(d, '([0-9]{1,2})\s*(?:-|to|/)\s*([0-9]{1,2})(\s*\+?\s*(?:months?|years?|yrs?))', '\1_\2\3', 'g');

  -- company_key -------------------------------------------------------------------------------
  out := out || jsonb_build_object('company_key', public.job_filter_company_key(r->>'Company'));

  -- apply_methods ----------------------------------------------------------------------------
  arr := '{}';
  if nullif(btrim(coalesce(r->>'posted_by', '')), '') is not null
     or nullif(btrim(coalesce(r->>'hirer_email', '')), '') is not null
     or appid = 'recruit@mystudentclub.com' then
    arr := arr || 'Easy Apply'::text;
  end if;
  if d ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' or (appid ~ '@' and appid <> 'recruit@mystudentclub.com') then
    arr := arr || 'Email'::text;
  end if;
  if d ~ 'forms\.gle|docs\.google\.com|https?://|www\.' or appid ~ 'https?://|forms\.gle|www\.' then
    arr := arr || 'Form / link'::text;
  end if;
  if d ~ 'whatsapp|wa\.me|(\+?91[ -]?)?\m[6-9][0-9]{4}[ -]?[0-9]{5}\M' or appid ~ '^\+?[0-9 -]{10,}$' then
    arr := arr || 'WhatsApp / call'::text;
  end if;
  if cardinality(arr) > 0 then out := out || jsonb_build_object('apply_methods', to_jsonb(arr)); end if;

  -- deadline ---------------------------------------------------------------------------------
  w := substring(d from '(?:last date|deadline|apply (?:by|before|latest by)|closing date|applications? (?:close|closes|closing)|last day)([^\n]{0,70})');
  if w is not null then
    lo := null;
    m := regexp_match(w, '\m([0-9]{1,2})(?:st|nd|rd|th)?[ /.-]*(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[ ,''-]*([0-9]{4})?');
    if m is not null then
      lo := public.job_filter_safe_date(coalesce(m[3]::int, extract(year from created)::int), public.job_filter_month_no(m[2]), m[1]::int);
    else
      m := regexp_match(w, '\m(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+([0-9]{1,2})(?:st|nd|rd|th)?\M,?\s*([0-9]{4})?');
      if m is not null then
        lo := public.job_filter_safe_date(coalesce(m[3]::int, extract(year from created)::int), public.job_filter_month_no(m[1]), m[2]::int);
      else
        m := regexp_match(w, '\m([0-9]{1,2})[/.-]([0-9]{1,2})[/.-]([0-9]{4}|[0-9]{2})\M');
        if m is not null then
          lo := public.job_filter_safe_date(m[3]::int, m[2]::int, m[1]::int);
        end if;
      end if;
    end if;
    if lo is not null and lo < created - 30 and m[3] is null then lo := (lo + interval '1 year')::date; end if;
    if lo is not null and lo between created - 7 and created + 200 then
      out := out || jsonb_build_object('deadline', lo);
    end if;
  end if;

  -- location type and work mode --------------------------------------------------------------
  if loc ~ 'pan[ -]?india|all india|multiple|various|across india|anywhere in india'
     or d ~ 'pan[ -]?india|multiple locations|across (all )?india|any location in india|anywhere in india|all over india' then
    out := out || jsonb_build_object('is_pan_india', true);
  end if;
  if loc ~ 'hybrid' or d ~ '\mhybrid\M' then
    out := out || jsonb_build_object('work_mode', 'Hybrid');
  elsif loc ~ 'remote|work from home|\mwfh\M' or d ~ '\mremote\M(?! area)|work from home|\mwfh\M|fully remote' then
    out := out || jsonb_build_object('work_mode', 'Remote');
  elsif d ~ 'work from office|\mwfo\M|in[- ]office|office[- ]based|from (our|the) office|onsite role|on-site role' then
    out := out || jsonb_build_object('work_mode', 'Office');
  end if;

  -- joining -------------------------------------------------------------------------------
  if d ~ 'immediate(ly)?\s*(joiners?|joining|join|start|basis|availability|available)|join(ing)?\s*(immediately|immediate)|joining\W{0,5}immediate|\masap\M|available immediately|can join immediately|early joiners?' then
    out := out || jsonb_build_object('immediate_joining', true);
  end if;

  lo := null;
  for m in select regexp_matches(d, '(?:join(?:ing)?|start(?:ing)?|commenc\w*)[^\n.;]{0,45}', 'g') loop
    months := public.job_filter_months(m[1]);
    if cardinality(months) > 0 then
      lo := months[1];
    else
      w := substring(m[1] from '\m(jan(?:uary)?|feb(?:ruary)?|march|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\M');
      if w is not null then
        j := public.job_filter_month_no(w);
        lo := make_date(extract(year from created)::int, j, 1);
        if lo < date_trunc('month', created)::date then lo := (lo + interval '1 year')::date; end if;
      end if;
    end if;
    if lo is not null and lo between date_trunc('month', created)::date - 31 and created + 400 then
      exit;
    end if;
    lo := null;
  end loop;
  if lo is not null then out := out || jsonb_build_object('joining_month', lo); end if;

  -- notice period ----------------------------------------------------------------------------
  v := null;
  for m in select regexp_matches(d, 'notice[^\n.;]{0,50}', 'g') loop
    for arr in select regexp_matches(m[1], '([0-9]{1,3})\s*(days?|months?)', 'g') loop
      n := arr[1]::numeric * case when arr[2] like 'month%' then 30 else 1 end;
      if n <= 180 then v := greatest(coalesce(v, 0), n); end if;
    end loop;
    if v is null and m[1] ~ 'immediate' then v := 0; end if;
  end loop;
  if v is null and out ? 'immediate_joining' then v := 0; end if;
  if v is not null then out := out || jsonb_build_object('notice_days', v::int); end if;

  -- pay --------------------------------------------------------------------------------------
  -- Stipend tables: rupees per month. Salary tables: rupees per year.
  vals := '{}';
  for ln in select regexp_split_to_table(d, '\n|•|·|\|') loop
    if ln !~ 'stipend|salary|ctc|remuneration|compensation|package|₹|\mrs\.?\s*[0-9]|\minr\M|per month|/month|\mlpa\M|lakh|lac\M|\mpay\M' then continue; end if;
    if ln ~ 'bonus|incentive|\mfees?\M|reimburs|allowance|turnover|crore|revenue|\maum\M|valuation|deal size|loan' then continue; end if;
    if ln ~ '\m(aed|usd|gbp|eur|sgd|dirhams?|dollars?)\M|\$|£|€' then continue; end if;
    monthly_line := ln ~ 'per month|/ ?month|p\.?\s?m\.?\M|\mpm\M|monthly|a month|per mon\M';
    ln := regexp_replace(ln, '([0-9][0-9.,]*)\s*(?:-|to)\s*(₹|rs\.?|inr)?\s*([0-9][0-9.,]*)\s*(lpa|l\.p\.a\.?|lakhs?|lacs?|l\M|k\M)', '\1 \4 - \3 \4', 'g');
    for m in select regexp_matches(ln, '(₹|\mrs\.?|\minr)?\s*([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]+)?)\s*(k|lpa|l\.p\.a\.?|lakhs?|lacs?|l)?(?![0-9a-z%])(?!\s*(?:months?|years?|yrs?|days?|%|am\M|pm\M|hours?|hrs?|partners?|employees|members|clients|crores?|cr\M|weeks?|\+\s*years?|st\M|nd\M|rd\M|th\M))', 'g') loop
      has_currency := m[1] is not null;
      n := replace(m[2], ',', '')::numeric;
      if m[3] = 'k' then
        n := n * 1000;
      elsif m[3] is not null then
        n := n * 100000;
        if not annual then n := round(n / 12); end if;
        if annual then vals := vals || n; end if;
        if not annual and n between 1000 and 200000 then vals := vals || n; end if;
        continue;
      end if;
      -- A bare number with no ₹, comma or unit is too often a year, a PIN code or a phone fragment.
      if not has_currency and position(',' in m[2]) = 0 and (annual or n between 1900 and 2099) then continue; end if;
      if not has_currency and n < 1000 then continue; end if;
      if annual then
        if n between 100000 and 20000000 and not monthly_line then
          vals := vals || n;
        elsif n between 1000 and 300000 then
          vals := vals || (n * 12);
        end if;
      else
        if n between 1000 and 200000 then vals := vals || n; end if;
      end if;
    end loop;
  end loop;
  begin
    v := nullif(regexp_replace(coalesce(r->>'Salary', ''), '[^0-9.]', '', 'g'), '')::numeric;
  exception when others then
    v := null;
  end;
  -- A few Semi-Qualified / Fresher rows store a monthly figure in Salary (e.g. 35000): make it yearly.
  if annual and v between 5000 and 99999 then v := v * 12; end if;
  if v is not null and v > 0 and ((annual and v between 50000 and 20000000) or (not annual and v between 500 and 200000)) then
    out := out || jsonb_build_object('pay_min', v::int, 'pay_max', v::int);
  elsif cardinality(vals) > 0 then
    out := out || jsonb_build_object('pay_min', (select min(x) from unnest(vals) x)::int, 'pay_max', (select max(x) from unnest(vals) x)::int);
  end if;

  -- exam criteria ----------------------------------------------------------------------------
  arr := '{}';
  if d ~ '(first|1st|single|one)[ -]*attempt|without (any )?(re-?attempts?|backlogs?)'
     and d !~ '(first|1st)[ -]*attempt\s*(is\s*)?(not|n''t)|not\s*(necessarily|mandatory|required)[^.\n]{0,20}(first|1st)[ -]*attempt' then
    arr := arr || 'First attempt'::text;
  end if;
  if d ~ 'rank ?holders?|all india rank|\mair\s*[0-9]|\mair\M[ -]?(holders?|rank)|\mrankers?\M' then
    arr := arr || 'Rank holder'::text;
  end if;
  if cardinality(arr) > 0 then out := out || jsonb_build_object('exam_criteria', to_jsonb(arr)); end if;

  -- attempt window (Industrial Training: CA Final attempt; Fresher: qualifying attempt) ---------
  if tbl in ('Industrial Training Job Portal', 'Fresher Jobs') then
    all_months := '{}';
    if tbl = 'Fresher Jobs' and d ~ 'no restriction on (the )?(year|attempt)|any (year|attempt) of (passing|qualification)|irrespective of (the )?attempt' then
      all_months := '{}';
    else
      for m in select regexp_matches(d,
          case when tbl = 'Fresher Jobs'
            then '([^\n;]{0,40}(?:qualif|pass(?:ed|ing|[ -]?outs?)|attempt|batch|cleared|final)[^\n;]{0,60})'
            else '([^\n;]{0,40}(?:attempt|ca final|final exam|final examination|final in)[^\n;]{0,70})' end, 'g') loop
        w := m[1];
        if w ~ '\minter(mediate)?\M|\mipcc\M|foundation' and w !~ 'final' then continue; end if;
        if tbl = 'Industrial Training Job Portal' and w ~ 'join|start|commenc|tenure|duration|stipend|deadline|last date' and w !~ 'attempt' then continue; end if;
        months := public.job_filter_months(w);
        if cardinality(months) = 0 then continue; end if;
        all_months := all_months || months;
        if w ~ 'onwards?|or later|and later|& later|or after|and after|and beyond|or beyond|or above|and above|\mlater\M|\mafter\M|\mpost\M' then later := true; end if;
        if w ~ 'or before|or earlier|before|\mtill\M|\muntil\M|up ?to|not later than|prior to' then earlier := true; end if;
      end loop;
    end if;
    if tbl = 'Industrial Training Job Portal' then
      select array_agg(x order by x) into all_months from unnest(all_months) x where x between created - 120 and created + 1300;
    else
      select array_agg(x order by x) into all_months from unnest(all_months) x where x between created - 1500 and created + 60;
    end if;
    if cardinality(all_months) > 0 then
      lo := all_months[1];
      hi := all_months[cardinality(all_months)];
      if later and not earlier then hi := null; end if;
      if earlier and not later then lo := null; end if;
      -- A single attempt for Industrial Training ("CA Final attempt: May 2028") is the earliest one allowed.
      if tbl = 'Industrial Training Job Portal' and lo = hi and not earlier then hi := null; end if;
      out := out || jsonb_build_object('attempt_from', lo, 'attempt_to', hi);
    end if;
  end if;

  -- Industrial Training duration ------------------------------------------------------------
  if tbl = 'Industrial Training Job Portal' then
    lo := null; i := null; j := null; open_ended := false;
    for m in select regexp_matches(dr, '([^\n;]{0,40})\m([0-9]{1,2})(?:_([0-9]{1,2}))?\s*months?\M', 'g') loop
      if m[1] ~ 'articleship|practical training|experience|completed|\mleft\M|remaining|balance|notice|probation|ppo|bond|within|after|last\M|past\M|every' then continue; end if;
      if m[2]::int not between 3 and 24 then continue; end if;
      i := least(coalesce(i, 99), m[2]::int);
      j := greatest(coalesce(j, 0), coalesce(m[3]::int, m[2]::int));
      if m[1] ~ 'minimum|at least|\mmin\M|atleast' and m[3] is null then open_ended := true; end if;
    end loop;
    if i is not null then
      if j > 24 then j := null; end if;
      if open_ended and i = j then j := null; end if;
      out := out || jsonb_build_object('duration_min_months', i, 'duration_max_months', j);
    end if;
  end if;

  -- employer type (labels match the Company Type filter options) ------------------------------
  w := case
    when ctype ~* '^big ?4$' then 'Big 4'
    when ctype ~* '^big ?6$' then 'Big 6'
    when ctype ~* '^mnc$' then 'MNC'
    when ctype ~* 'investment bank' then 'Investment Bank'
    when ctype ~* '^(pe|vc)\M|private equity|venture capital|pe ?/ ?vc' then 'PE / VC Fund'
    when ctype ~* 'listed' and ctype !~* 'unlisted' then 'Listed Company'
    when ctype ~* 'unlisted|^private' then 'Unlisted Company'
    when ctype ~* 'bank|nbfc|bfsi' then 'Bank / NBFC'
    when ctype ~* 'psu|government' then 'Government / PSU'
    when ctype ~* 'startup' then 'Startup'
    when ctype ~* 'unicorn' then 'Unicorn'
    when ctype ~* 'consult' then 'Consulting'
    when ctype ~* '^other$' then 'Other'
    when ctype ~* 'gcc|capability' then 'Global Capability Centre (GCC)'
    when ctype ~* 'ca firm' then 'CA Firm'
    when ctype ~* 'family' then 'Family-Owned Business'
    else null end;
  if w is null then
    w := case
      when co ~ '\m(deloitte|ey|ernst|kpmg|pwc|pricewaterhouse|price waterhouse|s r batliboi|srbc|b s r|bsr)\M' then 'Big 4'
      when co ~ '\m(grant thornton|walker chandiok|bdo|mska)\M' then 'Big 6'
      when co ~ '\m(bharat petroleum|bpcl|hindustan petroleum|hpcl|indian oil|iocl|ongc|ntpc|gail|sail|bhel|power grid|coal india|nhpc|power finance|rec limited|life insurance corporation|state bank of india|bank of baroda|punjab national|canara bank|union bank of india|nabard|sidbi|exim bank|irctc|ircon|rites|hindustan aeronautics|bharat electronics|nmdc|oil india|engineers india|airports authority|container corporation|ireda|hudco|irfc|new india assurance|general insurance corporation)\M'
           or d ~ '\mpsus?\M|public sector (undertaking|enterprise|bank)|government of india (enterprise|undertaking)|navratna|maharatna' then 'Government / PSU'
      when d ~ 'global capability cent|\mgcc\M|global business services|global delivery|shared services cent|captive' or co ~ '\m(gds|usi|gcc|global services|global business services|shared services)\M' then 'Global Capability Centre (GCC)'
      when co ~ '\m(bank|nbfc|fincorp|finserv|finance|financial services|housing finance|capital)\M' then 'Bank / NBFC'
      when d ~ 'investment bank' and co !~ '\m(associates|and co|llp)\M' then 'Investment Bank'
      when co ~ '(&|\mand) (co\M|company|associates)|associates\M|chartered accountants|\mca firm' then 'CA Firm'
      when d ~ 'start-?up' then 'Startup'
      when d ~ 'listed (company|entity|on)|\mnse\M|\mbse\M' then 'Listed Company'
      when d ~ '\mmncs?\M|multinational|fortune [0-9]+' then 'MNC'
      else null end;
  end if;
  if w is not null then out := out || jsonb_build_object('employer_type', w); end if;

  -- Articleship ------------------------------------------------------------------------------
  if tbl = 'Articleship Jobs' then
    w := case
      when d ~ 'awaiting (the )?results?|results? awaited|appeared (for|in)|pre[- ]articleship' then 'Awaiting result accepted'
      when d ~ 'either group|any one group|any group|single group|one group|group[ -]?(i|1)\M\s*(or|/)|(group[ -]?(i|ii|1|2)\M|both groups) or (any )?(one|single)' then 'Single group accepted'
      when d ~ 'both groups?' then 'Both groups required'
      else null end;
    if w is not null then out := out || jsonb_build_object('inter_requirement', w); end if;

    if d ~ '\mitt\M|\moc\M|orientation (course|programme|program)|information technology training|\micitss\M|\maicitss\M' then
      out := out || jsonb_build_object('itt_oc_required', true);
    end if;

    if d ~ 'transfer (cases?|candidates?|students?|articles?|of articles?)|articleship transfers?|transfer of articleship|transfers? (are |is )?(also )?(welcome|accepted|allowed|considered|permitted|can apply|open)|(open|welcome) (to|for) transfers?|transfer\s*:\s*(yes|allowed|accepted)'
       and d !~ 'no transfers?|transfer cases? (are |is )?not' then
      out := out || jsonb_build_object('transfer_accepted', true);
    end if;

    w := nullif(btrim(coalesce(r->>'Firm Type', '')), '');
    if w is not null then
      null; -- a Firm Type set by the poster wins
    elsif co ~ '\m(deloitte|ey|ernst|kpmg|pwc|pricewaterhouse|price waterhouse|s r batliboi|srbc|b s r|bsr|lovelock)\M' then w := 'Big 4';
    elsif co ~ '\m(grant thornton|walker chandiok|bdo|mska)\M' then w := 'Big 6';
    elsif co ~ '\m(rsm|nangia|t ?r ?chadha|mazars|forvis|baker tilly|asa|crowe|cnk|nexdigm|knav|kreston|mgi|pkf|moore|hlb|singhi|lodha|sgco|mukund m chitale|chaturvedi and shah|kirtane|shah dhandharia|sharp and tannan|khimji|sr dinodia|s r dinodia)\M' then w := 'Big 10';
    else
      i := null;
      for m in select regexp_matches(d, '([0-9]{1,3})\s*\+?\s*(partners|professionals|employees|members|people|staff|article assistants|articles|chartered accountants|cas)\M', 'g') loop
        if m[2] = 'partners' then
          if m[1]::int >= 5 then w := 'Mid-size CA Firm'; elsif m[1]::int between 1 and 4 then w := coalesce(w, 'Small-size CA Firm'); end if;
        elsif m[1]::int >= 30 then w := 'Mid-size CA Firm';
        end if;
      end loop;
      if w is null and d ~ 'mid[- ]?(size|sized|tier)' then w := 'Mid-size CA Firm'; end if;
      if w is null and d ~ 'proprietor|small (ca )?firm|boutique' then w := 'Small-size CA Firm'; end if;
      w := coalesce(w, 'Other');
    end if;
    out := out || jsonb_build_object('firm_size', w);

    arr := '{}';
    if d ~ 'statutory audit|stat audit|statutory (and|&) tax audit' then arr := arr || 'Statutory Audit'::text; end if;
    if d ~ 'tax audit' then arr := arr || 'Tax Audit'::text; end if;
    if d ~ 'income tax|direct tax|\mitr\M|\mtds\M|tax returns?|tax planning|tax filing' then arr := arr || 'Direct Tax'::text; end if;
    if d ~ '\mgst\M|indirect tax' then arr := arr || 'GST'::text; end if;
    if d ~ 'internal audit|internal control|\mifc\M|\msox\M|risk advisory|risk[- ]based audit|process audit' then arr := arr || 'Internal Audit'::text; end if;
    if d ~ 'bank audit|concurrent audit|branch audit|stock audit|revenue audit' then arr := arr || 'Bank Audit'::text; end if;
    if d ~ '\mroc\M|company law|secretarial|\mmca\M|companies act' then arr := arr || 'ROC & Company Law'::text; end if;
    if d ~ 'litigation|\mappeals?\M|scrutiny|tribunal|\mitat\M|show cause|assessments? (proceedings|matters|work)' then arr := arr || 'Litigation'::text; end if;
    if d ~ 'virtual cfo|\mvcfo\M|outsourc|book ?keeping' then arr := arr || 'Virtual CFO & Outsourcing'::text; end if;
    if d ~ 'valuation|due diligence|transaction (advisory|services)|\mm ?& ?a\M|mergers|deal advisory|financial model' then arr := arr || 'Valuation & Due Diligence'::text; end if;
    if d ~ 'transfer pricing|international tax|\mfema\M|\mdtaa\M|cross[- ]border' then arr := arr || 'Transfer Pricing & International Tax'::text; end if;
    if d ~ 'ind[ -]?as\M|\mifrs\M|us ?gaap' then arr := arr || 'Ind AS & IFRS'::text; end if;
    if d ~ 'forensic' then arr := arr || 'Forensic Audit'::text; end if;
    if d ~ 'finali[sz]ation|books of accounts?|financial statements' then arr := arr || 'Accounting & Finalisation'::text; end if;
    if d ~ 'project financ|cma data|loan syndication|debt syndication|project reports?' then arr := arr || 'Project Finance'::text; end if;
    if cardinality(arr) > 0 then out := out || jsonb_build_object('exposure_areas', to_jsonb(arr)); end if;

    arr := '{}';
    if d ~ 'listed (clients?|compan|entities)|\mmncs?\M|multinational|fortune [0-9]+|large corporates?|large (clients|companies)|conglomerates?' then arr := arr || 'Listed & MNC clients'::text; end if;
    if d ~ '\m(us|uk|usa|australian?|canad[a-z]*|international|overseas|foreign|nri|middle east|uae|singapore)\M\s*(based\s*)?(clients?|entities|companies|taxation|accounting|cpas?)|\mcpas?\M|cross[- ]border' then arr := arr || 'Foreign clients'::text; end if;
    if d ~ 'bank audit|concurrent audit|\mnbfcs?\M|banking (clients|sector|industry)|financial institutions|\mbanks\M' then arr := arr || 'Banks & NBFCs'::text; end if;
    if d ~ 'start-?ups?' then arr := arr || 'Startups'::text; end if;
    if d ~ '\mpsus?\M|public sector|government (companies|undertakings|audits?|clients|departments?)|\mc ?& ?ag\M|\mcag\M' then arr := arr || 'PSU & Government'::text; end if;
    if d ~ '\msmes?\M|\mmsmes?\M|family[- ]owned|small and medium' then arr := arr || 'SMEs & family businesses'::text; end if;
    if cardinality(arr) > 0 then out := out || jsonb_build_object('client_types', to_jsonb(arr)); end if;

    if d ~ 'outstation|out[- ]of[- ]station|willing(ness)? to travel|travell?ing (to|for|across|within)|travel to (client|various|different)|travel (is |will be )?(required|involved|expected|reimbursed)|flexib(le|ility) to travel|client (sites?|locations?|places?|premises|offices)'
       and d !~ 'no (outstation|travel)' then
      out := out || jsonb_build_object('outstation_audits', true);
    end if;
  end if;

  -- work types (Fresher / Experienced / Semi-Qualified) ----------------------------------------
  if annual then
    arr := '{}';
    if d ~ '\m(us|uk|usa|australian?|canad[a-z]*)\M[^.\n]{0,15}(tax|accounting|gaap|clients?|cpa|bookkeeping|process|entities)|\mcpas?\M|offshore' then arr := arr || 'US / UK accounting'::text; end if;
    if d ~ 'us ?gaap|\mifrs\M' then arr := arr || 'US GAAP / IFRS'::text; end if;
    if d ~ 'ind[ -]?as\M' then arr := arr || 'Ind AS'::text; end if;
    if d ~ 'virtual cfo|\mvcfo\M|outsourc|book ?keeping' then arr := arr || 'Virtual CFO / Outsourcing'::text; end if;
    if d ~ '\mkpo\M|\mbpo\M|shared services|captive|global capability|\mr2r\M|record to report|\mp2p\M|procure to pay|\mo2c\M|order to cash' then arr := arr || 'KPO / Shared services'::text; end if;
    if out->>'employer_type' = 'CA Firm' or d ~ '\mca firm\M|practice firm' then arr := arr || 'CA firm practice'::text; end if;
    if out->>'employer_type' in ('MNC', 'Listed Company', 'Unlisted Company', 'Startup', 'Unicorn', 'Government / PSU', 'Family-Owned Business')
       and not ('KPO / Shared services' = any(arr)) and not ('CA firm practice' = any(arr)) then
      arr := arr || 'In-house finance'::text;
    end if;
    if cardinality(arr) > 0 then out := out || jsonb_build_object('work_types', to_jsonb(arr)); end if;

    if d ~ 'night shift|\m(us|uk|emea|est|pst|cst|gmt|bst)\M\s*(shifts?|time ?zones?|hours|timings?|business hours)|overlap with (us|uk)' then
      out := out || jsonb_build_object('shift', 'US / UK shift');
    elsif d ~ 'rotational shifts?|rotating shifts?' then
      out := out || jsonb_build_object('shift', 'Rotational');
    elsif d ~ 'day shift|general shift|regular shift' then
      out := out || jsonb_build_object('shift', 'Day');
    end if;

    if d ~ '\mpqe\M|post[- ]qualification|post qualification|after qualification|after qualifying|post[- ]ca\M' then
      out := out || jsonb_build_object('pqe_required', true);
    end if;
  end if;

  -- tools ------------------------------------------------------------------------------------
  arr := '{}';
  if d ~ 'excel' then arr := arr || 'Excel'::text; end if;
  if d ~ '\mtally' then arr := arr || 'Tally'::text; end if;
  if d ~ '\msap\M|\ms/4 ?hana\M' then arr := arr || 'SAP'::text; end if;
  if d ~ 'oracle' then arr := arr || 'Oracle'::text; end if;
  if d ~ 'netsuite|zoho books|quickbooks|\mxero\M|navision|dynamics 365|ms dynamics|microsoft dynamics|\merp\M' then arr := arr || 'Other ERP'::text; end if;
  if d ~ 'power ?bi' then arr := arr || 'Power BI'::text; end if;
  if d ~ '\mpython\M' then arr := arr || 'Python'::text; end if;
  if d ~ '\msql\M' then arr := arr || 'SQL'::text; end if;
  if d ~ 'tableau|alteryx' then arr := arr || 'Tableau / Alteryx'::text; end if;
  if d ~ '\mvba\M|macros?\M' then arr := arr || 'VBA / Macros'::text; end if;
  if cardinality(arr) > 0 then out := out || jsonb_build_object('tools', to_jsonb(arr)); end if;

  -- working days -----------------------------------------------------------------------------
  if d ~ '\m(5|five)[ -]*days?\s*(a\s*)?(working|week|work)|mon(day)?\s*(-|to)\s*fri(day)?|5 days working|five[- ]day (work )?week|saturdays? (and sundays? )?(off|holiday)' then
    out := out || jsonb_build_object('working_days', 5);
  elsif d ~ '\m(6|six)[ -]*days?\s*(a\s*)?(working|week|work)?|mon(day)?\s*(-|to)\s*sat(urday)?|alternate saturdays?|six[- ]day (work )?week' then
    out := out || jsonb_build_object('working_days', 6);
  end if;

  -- years of experience (only used when the table's yoe is empty) ------------------------------
  if annual then
    i := null;
    for m in select regexp_matches(dr, '([^\n;]{0,40})\m([0-9]{1,2})(?:_[0-9]{1,2})?\s*\+?\s*(?:years?|yrs?)\M([^\n;]{0,40})', 'g') loop
      w := m[1] || ' ' || m[3];
      if w !~ 'experience|\mexp\M|post[- ]qualification|\mpqe\M|relevant|work(ing)?\M|background' then continue; end if;
      if w ~ 'established|since|legacy|founded|history|in business|old\M|\mage\M|years? of (articleship|training)|over [0-9]+ years|in the (industry|market) for' then continue; end if;
      if m[2]::int > 25 then continue; end if;
      i := least(coalesce(i, 99), m[2]::int);
    end loop;
    if i is null and (d ~ '\mfreshers?\M' or coalesce(r->>'Experience', '') ~* 'fresher') then i := 0; end if;
    if i is not null then out := out || jsonb_build_object('yoe', i); end if;
  end if;

  return out;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Trigger: fill empty filter columns on insert and when the text they come from changes.
-- ---------------------------------------------------------------------------------------------

-- Every column the extractor can fill.
create or replace function public.job_filter_keys() returns text[]
language sql immutable as $$
  select array['pay_min', 'pay_max', 'apply_methods', 'deadline', 'company_key', 'is_pan_india', 'work_mode',
    'immediate_joining', 'joining_month', 'notice_days', 'attempt_from', 'attempt_to', 'duration_min_months',
    'duration_max_months', 'exam_criteria', 'employer_type', 'inter_requirement', 'itt_oc_required',
    'transfer_accepted', 'firm_size', 'exposure_areas', 'client_types', 'outstation_audits', 'work_types',
    'shift', 'pqe_required', 'tools', 'working_days', 'yoe']
$$;

-- The values to write for one row: extracted values for columns that exist and are still empty.
create or replace function public.job_filter_patch(tbl text, cur jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(public.job_filter_extract(tbl, cur)) e
  where cur ? e.key
    and jsonb_typeof(e.value) <> 'null'
    and (cur->e.key is null or jsonb_typeof(cur->e.key) = 'null')
$$;

-- On insert: fill the empty columns. On an edit of the text they come from: work them out again,
-- except columns the same edit sets itself, and an existing yoe (which comes from the poster).
create or replace function public.job_filter_fill() returns trigger
language plpgsql as $$
declare
  cur jsonb;
  prev jsonb;
  ext jsonb;
  patch jsonb := '{}'::jsonb;
  k text;
begin
  begin
    cur := to_jsonb(new);
    if tg_op = 'UPDATE' then
      prev := to_jsonb(old);
      if cur->'Description' is distinct from prev->'Description' or cur->'Company' is distinct from prev->'Company'
         or cur->'Location' is distinct from prev->'Location' or cur->'Salary' is distinct from prev->'Salary' then
        ext := public.job_filter_extract(tg_table_name, cur);
        foreach k in array public.job_filter_keys() loop
          continue when not (cur ? k);
          continue when cur->k is distinct from prev->k;           -- set by this edit
          continue when k = 'yoe' and jsonb_typeof(cur->k) <> 'null';
          patch := patch || jsonb_build_object(k, coalesce(ext->k, 'null'::jsonb));
        end loop;
      else
        patch := public.job_filter_patch(tg_table_name, cur);
      end if;
    else
      patch := public.job_filter_patch(tg_table_name, cur);
    end if;
    if patch <> '{}'::jsonb then
      new := jsonb_populate_record(new, patch);
    end if;
  exception when others then
    raise warning 'job_filter_fill skipped for % id %: %', tg_table_name, to_jsonb(new)->>'id', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists job_filter_fill on "Articleship Jobs";
create trigger job_filter_fill before insert or update of "Description", "Company", "Location", "Salary"
  on "Articleship Jobs" for each row execute function public.job_filter_fill();

drop trigger if exists job_filter_fill on "Industrial Training Job Portal";
create trigger job_filter_fill before insert or update of "Description", "Company", "Location", "Salary"
  on "Industrial Training Job Portal" for each row execute function public.job_filter_fill();

drop trigger if exists job_filter_fill on "Fresher Jobs";
create trigger job_filter_fill before insert or update of "Description", "Company", "Location", "Salary"
  on "Fresher Jobs" for each row execute function public.job_filter_fill();

drop trigger if exists job_filter_fill on "Semi Qualified Jobs";
create trigger job_filter_fill before insert or update of "Description", "Company", "Location", "Salary"
  on "Semi Qualified Jobs" for each row execute function public.job_filter_fill();

-- ---------------------------------------------------------------------------------------------
-- Read access: the portal (anon and signed-in students) reads these like the other public columns.
-- ---------------------------------------------------------------------------------------------

grant select (pay_min, pay_max, apply_methods, deadline, company_key, is_pan_india, work_mode, immediate_joining,
              inter_requirement, itt_oc_required, transfer_accepted, firm_size, exposure_areas, client_types,
              outstation_audits, working_days)
  on "Articleship Jobs" to anon, authenticated;

grant select (pay_min, pay_max, apply_methods, deadline, company_key, is_pan_india, work_mode, immediate_joining,
              joining_month, attempt_from, attempt_to, duration_min_months, duration_max_months, exam_criteria,
              employer_type, tools)
  on "Industrial Training Job Portal" to anon, authenticated;

grant select (pay_min, pay_max, apply_methods, deadline, company_key, is_pan_india, work_mode, immediate_joining,
              notice_days, attempt_from, attempt_to, exam_criteria, employer_type, work_types, shift, tools, pqe_required)
  on "Fresher Jobs" to anon, authenticated;

grant select (pay_min, pay_max, apply_methods, deadline, company_key, is_pan_india, work_mode, immediate_joining,
              notice_days, employer_type, work_types, shift, tools, working_days, yoe)
  on "Semi Qualified Jobs" to anon, authenticated;
