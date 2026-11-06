-- Articleship "Firm Type" from the firm's name and description (6 Nov 2026).
--
-- The Firm Type filter on the Articleship portal matched nothing: "Firm Type" was blank on all 13,155 vacancies,
-- because nothing that posts vacancies fills it. Every vacancy now gets one tier (Padam, 6 Nov 2026: "Big 4 is clear,
-- big 6 is clear, big 10 is clear, big 20 is clear. Mid-size is everything else, small size is those who have clearly
-- specified themselves as small size"):
--   Big 4   = Deloitte, EY, KPMG, PwC and their Indian network firms
--             (Deloitte Haskins & Sells, S R Batliboi / SRBC, B S R & Co, Price Waterhouse, Lovelock & Lewes)
--   Big 6   = Grant Thornton (Walker Chandiok) and BDO (incl. MSKA & Associates)
--   Big 10  = RSM (incl. Suresh Surana), Nangia (Andersen), Baker Tilly ASA (ASA & Associates), Nexdigm
--   Big 20  = T R Chadha, Forvis Mazars (Haribhakti), Kirtane & Pandit, Moore Singhi (Singhi & Co), Sharp & Tannan,
--             CNK & Associates, Chaturvedi & Shah, KNAV, PKF Sridhar & Santhanam, Crowe
--   Small-size CA Firm = the vacancy says the firm is small ("a small but dynamic CA firm", "we're small and close-knit")
--   Mid-size CA Firm   = every other firm
-- The page treats the Big tiers as cumulative (Big 6 also shows the Big 4; Big 20 shows all the top firms).
--
-- A trigger sets it for new vacancies and when the company name or description changes, whoever posts them.
-- A "Firm Type" chosen by hand (admin panel) is never overwritten. The last statement fills existing rows once.
--
-- Additive: two functions, one trigger, and blank values filled in. No column added or removed.
-- Reversible. To undo:
--   drop trigger articleship_firm_tier_trg on "Articleship Jobs";
--   drop function public.articleship_firm_tier_trg();
--   update "Articleship Jobs" set "Firm Type" = null
--    where "Firm Type" is not distinct from public.msc_firm_type("Company", "Description");
--   drop function public.msc_firm_type(text, text); drop function public.msc_firm_tier(text);

-- Big tier from the name alone; null for firms outside the top 20.
create or replace function public.msc_firm_tier(company text)
returns text
language plpgsql
immutable
as $$
declare
  n text;
begin
  -- lower case, "&" = "and", dots dropped ("S.R." = "sr"), other punctuation = space
  n := lower(coalesce(company, ''));
  n := replace(n, '&', ' and ');
  n := replace(n, '.', '');
  n := btrim(regexp_replace(regexp_replace(n, '[^a-z0-9]+', ' ', 'g'), ' +', ' ', 'g'));
  if n = '' then
    return null;
  end if;

  if n ~ '\y(deloitte|kpmg|pwc|ernst and young|pricewaterhouse|lovelock and lewes)\y'
     or n ~ '\yprice ?waterhouse'
     or n ~ '\yhaskins and sells\y'
     or n ~ '\yey\y'
     or n ~ '\ys ?r ?b ?c\y'
     or n ~ '\ys ?r batliboi\y'
     or (n ~ '\yb ?s ?r\y' and n !~ '\yb ?s ?r and associates\y') then
    return 'Big 4';
  end if;

  if n ~ '\y(grant thornton|walker chandiok|bdo|mska)\y' then
    return 'Big 6';
  end if;

  if (n ~ '\yrsm\y' and n !~ '\yrsm and associates\y')
     or n ~ '\ysuresh surana\y'
     or n ~ '\y(nangia|baker tilly|bakertilly|nexdigm)\y'
     or n ~ '\yasa and associates\y'
     or n ~ '^asa( india)?( llp)?$' then
    return 'Big 10';
  end if;

  if n ~ '\yt ?r chadha\y'
     or n ~ '\y(mazars|kirtane|knav|crowe)\y'
     or (n ~ '\yharibhakti\y' and n !~ '\ydesai haribhakti\y')  -- Desai Haribhakti is a different firm
     or n ~ '\ymoore singhi\y' or n ~ '\ysinghi and co\y'
     or n ~ '\ysharp and tannan\y'
     or n ~ '\yc ?n ?k and associates\y' or n ~ '^c ?n ?k( llp)?$'
     or n ~ '\ychaturvedi and shah\y'
     or n ~ '\ypkf\y' then
    return 'Big 20';
  end if;

  return null;
end;
$$;

-- Every firm's type: its Big tier, else Small-size when the vacancy says the firm is small, else Mid-size.
create or replace function public.msc_firm_type(company text, description text)
returns text
language plpgsql
immutable
as $$
declare
  tier text;
  d text;
begin
  if coalesce(btrim(company), '') = '' then
    return null;
  end if;
  tier := public.msc_firm_tier(company);
  if tier is not null then
    return tier;
  end if;
  d := lower(coalesce(description, ''));
  -- Only the firm describing itself counts: "small and mid-sized clients" or "we work with small firms" don't.
  if d ~ '\y(a|we are a|is a|are a)\s+small(\s+but\s+\w+|\s+\w+){0,2}\s+(ca\s+|chartered\s+accountan\w+\s+)?(firm|practice|set-?up|office)\y'
     or d ~ '\ywe(''|’)?re\s+small\y' or d ~ '\ywe\s+are\s+small\y'
     or d ~ '\ysmall,?\s+(and\s+)?close-knit\y' then
    return 'Small-size CA Firm';
  end if;
  return 'Mid-size CA Firm';
end;
$$;

create or replace function public.articleship_firm_tier_trg()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(btrim(new."Firm Type"), '') = '' then
      new."Firm Type" := public.msc_firm_type(new."Company", new."Description");
    end if;
  elsif (new."Company" is distinct from old."Company" or new."Description" is distinct from old."Description")
        and new."Firm Type" is not distinct from old."Firm Type"
        and (coalesce(btrim(old."Firm Type"), '') = ''
             or old."Firm Type" = public.msc_firm_type(old."Company", old."Description")) then
    -- Name or description changed and the old value was blank or derived: derive again.
    new."Firm Type" := public.msc_firm_type(new."Company", new."Description");
  elsif coalesce(btrim(new."Firm Type"), '') = '' then
    -- Cleared by hand: fill it again from the name.
    new."Firm Type" := public.msc_firm_type(new."Company", new."Description");
  end if;
  return new;
end;
$$;

drop trigger if exists articleship_firm_tier_trg on public."Articleship Jobs";
create trigger articleship_firm_tier_trg
  before insert or update of "Company", "Description", "Firm Type" on public."Articleship Jobs"
  for each row execute function public.articleship_firm_tier_trg();

-- One-time fill for existing vacancies with a blank "Firm Type".
update public."Articleship Jobs"
   set "Firm Type" = public.msc_firm_type("Company", "Description")
 where coalesce(btrim("Firm Type"), '') = ''
   and "Firm Type" is distinct from public.msc_firm_type("Company", "Description");
