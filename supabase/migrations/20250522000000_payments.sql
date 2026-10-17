-- Run in Supabase SQL Editor (Dashboard → SQL) if you are not using Supabase CLI migrations.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  purpose text not null default 'billboard_subscription',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_status_idx on public.payments (status);

alter table public.payments enable row level security;

create policy "Users can read own payments"
  on public.payments
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Inserts/updates are performed by Edge Functions using the service role key.
