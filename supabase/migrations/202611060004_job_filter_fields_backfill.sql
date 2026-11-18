-- Backfill the structured vacancy filter columns (202611060003_job_filter_fields.sql) for jobs that
-- were posted before the trigger existed. Run once, after 202611060003.
--
-- Writes only the new filter columns (and "Semi Qualified Jobs".yoe / "Fresher Jobs".yoe where they
-- are empty). It never changes Description, Company, Salary or any other existing value.
--
-- session_replication_role = replica (this transaction only) stops other row triggers on these
-- tables, e.g. new-job notifications, from firing for the backfill. The values are set directly,
-- so the job_filter_fill trigger is not needed here.
--
-- Reversible: yes. To undo, set the new columns back to null, e.g.
--   update "Articleship Jobs" set pay_min = null, pay_max = null, ... ;
-- (or drop them with the reverse SQL in 202611060003).

set local session_replication_role = replica;

do $$
declare
  t text;
  cols text[];
  extract_keys text[] := public.job_filter_keys();
begin
  foreach t in array array['Articleship Jobs', 'Industrial Training Job Portal', 'Fresher Jobs', 'Semi Qualified Jobs'] loop
    select array_agg(column_name::text order by column_name) into cols
    from information_schema.columns
    where table_schema = 'public' and table_name = t and column_name = any(extract_keys);

    execute format(
      'with p as (select x.id, public.job_filter_patch(%4$L, to_jsonb(x)) as patch from public.%1$I x) '
      'update public.%1$I as x set (%2$s) = (select %3$s from jsonb_populate_record(x, p.patch) r) '
      'from p where p.id = x.id and p.patch <> ''{}''::jsonb',
      t,
      (select string_agg(format('%I', c), ', ') from unnest(cols) c),
      (select string_agg(format('r.%I', c), ', ') from unnest(cols) c),
      t);
  end loop;
end $$;
