-- Job digest marker: for each job table, the moment up to which jobs were already announced by
-- workers/job-digest-worker. Each digest run announces the jobs created after this moment (and at least a minute old),
-- then moves it. Additive: nothing else reads or writes it, and it never reads or changes a job table.
--
-- Reversible: yes - `drop table job_digest_state;` removes it. Nothing references it.
-- Only the service role (the Worker) can touch it: RLS is on with no policy, and anon/authenticated lose all grants.
--
-- Run it right before the digest Worker goes live. Every table starts at "now", so only jobs created after this runs are
-- ever announced, never the backlog. (To restart the clock later: update job_digest_state set announced_through = now();)

create table if not exists public.job_digest_state (
  table_name text primary key,
  announced_through timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_digest_state enable row level security;
revoke all on public.job_digest_state from anon, authenticated;

insert into public.job_digest_state (table_name)
values ('Industrial Training Job Portal'), ('Fresher Jobs'), ('Semi Qualified Jobs'), ('Articleship Jobs')
on conflict (table_name) do nothing;
