-- Articleship "Firm Type" from the firm's name (6 Nov 2026).
--
-- The Big 4 / Big 6 / Big 10 filter on the Articleship portal matched nothing: "Firm Type" was blank on all
-- 13,155 vacancies, because nothing that posts vacancies fills it. This sets it from the company name:
--   Big 4  = Deloitte, EY, KPMG, PwC and their Indian network firms
--            (Deloitte Haskins & Sells, S R Batliboi / SRBC, B S R & Co, Price Waterhouse, Lovelock & Lewes)
--   Big 6  = Grant Thornton (Walker Chandiok) and BDO
--   Big 10 = RSM, Nangia (Andersen), Baker Tilly ASA (ASA & Associates), Nexdigm
-- Each vacancy stores its own tier; the page treats the tiers as cumulative (Big 6 also shows the Big 4).
-- Other firms stay blank: their size can't be told from the name.
--
-- A trigger fills it for new vacancies and when the company name changes, whoever posts them. A "Firm Type"
-- chosen by hand (admin panel) is never overwritten. The last statement fills existing rows once (~1,100 rows).
--
-- Additive: one function, one trigger, and blank values filled in. No column added or removed.
-- Reversible. To undo:
--   drop trigger articleship_firm_tier_trg on "Articleship Jobs";
--   drop function public.articleship_firm_tier_trg();
--   update "Articleship Jobs" set "Firm Type" = null
--    where "Firm Type" is not distinct from public.msc_firm_tier("Company") and "Firm Type" is not null;
--   drop function public.msc_firm_tier(text);

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

  if n ~ '\y(grant thornton|walker chandiok|bdo)\y' then
    return 'Big 6';
  end if;

  if (n ~ '\yrsm\y' and n !~ '\yrsm and associates\y')
     or n ~ '\y(nangia|baker tilly|bakertilly|nexdigm)\y'
     or n ~ '\yasa and associates\y'
     or n ~ '^asa( india)?( llp)?$' then
    return 'Big 10';
  end if;

  return null;
end;
$$;

create or replace function public.articleship_firm_tier_trg()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(btrim(new."Firm Type"), '') = '' then
      new."Firm Type" := public.msc_firm_tier(new."Company");
    end if;
  elsif new."Company" is distinct from old."Company"
        and new."Firm Type" is not distinct from old."Firm Type"
        and (coalesce(btrim(old."Firm Type"), '') = '' or old."Firm Type" = public.msc_firm_tier(old."Company")) then
    -- The name changed and the old value was blank or derived from the old name: derive again.
    new."Firm Type" := public.msc_firm_tier(new."Company");
  end if;
  return new;
end;
$$;

drop trigger if exists articleship_firm_tier_trg on public."Articleship Jobs";
create trigger articleship_firm_tier_trg
  before insert or update of "Company", "Firm Type" on public."Articleship Jobs"
  for each row execute function public.articleship_firm_tier_trg();

-- One-time fill for existing vacancies with a blank "Firm Type".
update public."Articleship Jobs"
   set "Firm Type" = public.msc_firm_tier("Company")
 where coalesce(btrim("Firm Type"), '') = ''
   and public.msc_firm_tier("Company") is not null;
