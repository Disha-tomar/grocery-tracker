-- Pantry Pal — Web Push subscriptions
-- Run this in the Supabase SQL editor BEFORE deploying the matching build.

-- One row per device: a person may use both a phone and a laptop, and each
-- browser hands out its own endpoint.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- An endpoint is a capability to push to someone's device, so nobody may read
-- anyone else's row. The Edge Function fans out with the service-role key.
create policy "manage own subscriptions"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
