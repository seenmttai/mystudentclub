-- Joining pill on Industrial Training vacancies (6 Nov 2026, Aniket's ask).
--
-- joining_label = "Immediate Joiner", "Nov Joinee", "Dec Joinee", ... read from the vacancy description, or null when
-- the description doesn't say. Cards show it next to the domain pill. It lives in the database because the job list
-- doesn't download descriptions (they're long), and so a "joining" filter can use it later.
--
-- Kept up to date by a trigger whenever a vacancy is added or its description changes, whoever writes it (admin
-- panel, hire.msc, bots). The last statement fills it once for existing rows.
--
-- Additive: one nullable column, one function, one trigger. Old code ignores the column.
-- Reversible. To undo:
--   drop trigger it_joining_label_trg on "Industrial Training Job Portal";
--   drop function public.it_joining_label_trg();
--   alter table "Industrial Training Job Portal" drop column joining_label;
--   drop function public.msc_joining_label(text);
-- New page code selects joining_label, so run this before merging the PR, and undo it only after reverting the PR.

create or replace function public.msc_joining_label(description text)
returns text
language plpgsql
immutable
as $$
declare
  body text;
  hit text[];
  win text;
  mon text;
begin
  if description is null or btrim(description) = '' then
    return null;
  end if;
  body := regexp_replace(description, '[*_`#]', ' ', 'g');

  -- "Immediate joiner(s) / joining / start", "Joining: Immediate", "Joining by - Immediately", "join within a week".
  if body ~* '\yimmediate(ly)?[[:space:]/-]*(/[[:space:]]*early[[:space:]]+)?(joiners?|joinees?|joining|start|availability)\y'
     or body ~* '\y(joining|join|start([[:space:]]+date)?|doj)\y[^\n.]{0,25}\yimmediate(ly)?\y'
     or body ~* '\yjoin[[:space:]]+within[[:space:]]+(a|one|1)[[:space:]]+week\y' then
    return 'Immediate Joiner';
  end if;

  -- A month within 60 characters after a joining cue: "Joining: Latest by 20 November 2026" = "Nov Joinee".
  -- "join our team" is not a cue; exam months ("CA Final examinations in May 2028") are skipped.
  for hit in
    select regexp_matches(body,
      '\y(joining|joinee|joiners?|join[[:space:]]+(by|before|in|from|on|latest)|start(ing)?[[:space:]]+date|starts?[[:space:]]+(from|in|by|on)|date[[:space:]]+of[[:space:]]+joining|doj)\y([^\n]{0,60})',
      'gi')
  loop
    win := hit[5];
    continue when win is null or win ~* '\y(exam[a-z]*|attempt|results?)\y';
    mon := left(substring(lower(win) from '\y(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\y'), 3);
    continue when mon is null;
    -- "may" is also an ordinary word: count it only next to a year, a day, "mid/early/end/late" or "in".
    continue when mon = 'may' and win !~* '(\ymay[[:space:]]+(20[0-9][0-9]|[0-9]{1,2})\y|\y[0-9]{1,2}(st|nd|rd|th)?[[:space:]]+may\y|\y(mid|early|end|late)[[:space:]-]+(of[[:space:]]+)?may\y|\yin[[:space:]]+may\y)';
    return initcap(mon) || ' Joinee';
  end loop;
  return null;
end;
$$;

alter table public."Industrial Training Job Portal" add column if not exists joining_label text;

create or replace function public.it_joining_label_trg()
returns trigger
language plpgsql
as $$
begin
  new.joining_label := public.msc_joining_label(new."Description");
  return new;
end;
$$;

drop trigger if exists it_joining_label_trg on public."Industrial Training Job Portal";
create trigger it_joining_label_trg
  before insert or update of "Description" on public."Industrial Training Job Portal"
  for each row execute function public.it_joining_label_trg();

-- One-time fill for existing vacancies (only rows whose label would change).
update public."Industrial Training Job Portal"
   set joining_label = public.msc_joining_label("Description")
 where joining_label is distinct from public.msc_joining_label("Description");
