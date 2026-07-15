-- Pantry Pal — Milestone 1 schema
-- Run this in the Supabase SQL editor (or `supabase db push`).

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  emoji text not null default '🛒',
  category text not null default 'kitchen'
    check (category in ('kitchen', 'bathroom', 'cleaning', 'other')),
  unit text not null default 'pcs'
    check (unit in ('g', 'ml', 'pcs', 'packet')),
  current_qty numeric not null default 0,
  low_threshold numeric not null default 0,
  is_usual boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  qty numeric not null check (qty > 0),
  price numeric check (price >= 0),
  purchased_at timestamptz not null default now(),
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index items_household_idx on public.items (household_id);
create index purchases_item_idx on public.purchases (item_id, purchased_at desc);
create index purchases_household_idx on public.purchases (household_id);

-- ---------------------------------------------------------------------------
-- Stock stays consistent via triggers, no matter which family member logs it.
-- ---------------------------------------------------------------------------

create or replace function public.apply_purchase_to_stock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.items set current_qty = current_qty + new.qty where id = new.item_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.items
      set current_qty = greatest(current_qty - old.qty, 0)
      where id = old.item_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger purchases_apply_stock
  after insert or delete on public.purchases
  for each row execute function public.apply_purchase_to_stock();

-- ---------------------------------------------------------------------------
-- Household membership helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_household_id()
returns uuid
language sql
security definer set search_path = public
stable
as $$
  select household_id from public.profiles where user_id = auth.uid();
$$;

-- Creates a household, points the caller's profile at it, returns the row.
create or replace function public.create_household(household_name text, member_name text)
returns public.households
language plpgsql
security definer set search_path = public
as $$
declare
  new_household public.households;
begin
  insert into public.households (name) values (household_name) returning * into new_household;

  insert into public.profiles (user_id, household_id, display_name)
  values (auth.uid(), new_household.id, member_name)
  on conflict (user_id)
    do update set household_id = new_household.id, display_name = member_name;

  return new_household;
end;
$$;

-- Joins an existing household by invite code, returns the row.
create or replace function public.join_household(code text, member_name text)
returns public.households
language plpgsql
security definer set search_path = public
as $$
declare
  found public.households;
begin
  select * into found from public.households where invite_code = upper(trim(code));
  if found.id is null then
    raise exception 'invalid_invite_code';
  end if;

  insert into public.profiles (user_id, household_id, display_name)
  values (auth.uid(), found.id, member_name)
  on conflict (user_id)
    do update set household_id = found.id, display_name = member_name;

  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: everything is scoped to the caller's household.
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.purchases enable row level security;

create policy "members read their household"
  on public.households for select
  using (id = public.current_household_id());

create policy "members rename their household"
  on public.households for update
  using (id = public.current_household_id());

create policy "read own profile or housemates"
  on public.profiles for select
  using (user_id = auth.uid() or household_id = public.current_household_id());

create policy "insert own profile"
  on public.profiles for insert
  with check (user_id = auth.uid());

create policy "update own profile"
  on public.profiles for update
  using (user_id = auth.uid());

create policy "household items: select"
  on public.items for select
  using (household_id = public.current_household_id());

create policy "household items: insert"
  on public.items for insert
  with check (household_id = public.current_household_id());

create policy "household items: update"
  on public.items for update
  using (household_id = public.current_household_id());

create policy "household items: delete"
  on public.items for delete
  using (household_id = public.current_household_id());

create policy "household purchases: select"
  on public.purchases for select
  using (household_id = public.current_household_id());

create policy "household purchases: insert"
  on public.purchases for insert
  with check (household_id = public.current_household_id() and added_by = auth.uid());

create policy "household purchases: delete"
  on public.purchases for delete
  using (household_id = public.current_household_id());

-- ---------------------------------------------------------------------------
-- Realtime: family members see each other's changes live.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.items;
alter publication supabase_realtime add table public.purchases;
