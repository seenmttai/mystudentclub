-- Daily assignments (MSC-26, slice 1): short paid on-site work for 1–few days in another town
-- (stock audits, bank branch audits). Firms post; students browse by location and apply in one tap.
-- Additive only: two new tables, their policies and grants. Nothing existing is changed.
BEGIN;

create table if not exists public.daily_assignments (
  id uuid primary key default gen_random_uuid(),
  firm_name text not null check (length(btrim(firm_name)) between 2 and 160),
  title text not null check (length(btrim(title)) between 3 and 160),
  work_type text not null check (work_type in ('Stock audit','Bank branch audit','Concurrent audit','Physical verification','Other')),
  city text not null check (length(btrim(city)) between 2 and 80),
  state text,
  start_date date not null,
  end_date date not null,
  people_needed integer not null default 1 check (people_needed between 1 and 200),
  pay_amount numeric(10,2) check (pay_amount is null or pay_amount >= 0),
  pay_unit text not null default 'per day' check (pay_unit in ('per day','total')),
  description text check (description is null or length(description) <= 4000),
  open_to text[] not null default array['Article assistant','Semi-qualified CA','Non-CA']::text[],
  -- Where applications go: the firm's hire.msc account (slice 2) and/or an email the firm gave.
  hirer_id uuid references auth.users(id) on delete set null,
  apply_email text check (apply_email is null or apply_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status text not null default 'open' check (status in ('open','closed','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists daily_assignments_open_idx on public.daily_assignments (status, start_date);
create index if not exists daily_assignments_city_idx on public.daily_assignments (lower(city));

create table if not exists public.daily_assignment_applications (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.daily_assignments(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  current_location text check (current_location is null or length(current_location) <= 80),
  pay_ok boolean,
  done_before boolean,
  note text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (assignment_id, user_id)
);

alter table public.daily_assignments enable row level security;
alter table public.daily_assignment_applications enable row level security;

-- Anyone can see open assignments that haven't ended. Posting comes from hire.msc (slice 2) or the team.
drop policy if exists daily_assignments_read_open on public.daily_assignments;
create policy daily_assignments_read_open on public.daily_assignments for select to anon, authenticated
  using (status = 'open' and end_date >= current_date);

-- A signed-in student applies for themselves, only to an open assignment, and sees only their own applications.
drop policy if exists daily_assignment_applications_insert_own on public.daily_assignment_applications;
create policy daily_assignment_applications_insert_own on public.daily_assignment_applications for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.daily_assignments a where a.id = assignment_id and a.status = 'open' and a.end_date >= current_date)
  );
drop policy if exists daily_assignment_applications_read_own on public.daily_assignment_applications;
create policy daily_assignment_applications_read_own on public.daily_assignment_applications for select to authenticated
  using (user_id = auth.uid());

revoke all on public.daily_assignments from anon, authenticated;
revoke all on public.daily_assignment_applications from anon, authenticated;
grant select (id, firm_name, title, work_type, city, state, start_date, end_date, people_needed, pay_amount, pay_unit, description, open_to, status, created_at)
  on public.daily_assignments to anon, authenticated;
grant select, insert (assignment_id, current_location, pay_ok, done_before, note)
  on public.daily_assignment_applications to authenticated;

COMMIT;
