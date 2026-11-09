-- Paid registrations for programmes that do not give LMS access at payment time.
-- First user: MSC Articleship Program (9 Nov 2026), ₹1,499 via PayU.
-- Written only by the checkpayment Worker (service role). No policies, so the
-- anon and authenticated roles can neither read nor write these rows.

create table if not exists public.program_registration (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  program text not null,
  name text not null,
  email text not null,
  phone text not null,
  amount numeric(10, 2) not null,
  coupon text,
  txnid text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'free', 'failed')),
  payu_id text,
  payu_mode text,
  paid_at timestamptz,
  confirmation_sent_at timestamptz,
  note text
);

create index if not exists program_registration_program_status_idx
  on public.program_registration (program, status, created_at desc);

create index if not exists program_registration_email_idx
  on public.program_registration (lower(email));

alter table public.program_registration enable row level security;

revoke all on table public.program_registration from anon, authenticated;
