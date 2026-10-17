create table if not exists public.ad_click_totals (
  ad_id uuid primary key references public.subscriptions (id) on delete cascade,
  click_count bigint not null default 0 check (click_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ad_click_totals_click_count_idx
  on public.ad_click_totals (click_count desc, updated_at desc);

alter table public.ad_click_totals enable row level security;

grant select on public.ad_click_totals to anon, authenticated;

create policy "Anyone can read shared ad click totals"
  on public.ad_click_totals
  for select
  to anon, authenticated
  using (true);

create or replace function public.increment_ad_click(target_ad_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count bigint;
begin
  insert into public.ad_click_totals as totals (ad_id, click_count, updated_at)
  values (target_ad_id, 1, now())
  on conflict (ad_id)
  do update
    set click_count = totals.click_count + 1,
        updated_at = now()
  returning click_count into next_count;

  return next_count;
end;
$$;

grant execute on function public.increment_ad_click(uuid) to anon, authenticated;
