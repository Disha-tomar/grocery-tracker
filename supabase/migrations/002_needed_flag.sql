-- Pantry Pal — "we need this" requests
-- Run this in the Supabase SQL editor BEFORE deploying the matching build.

-- A request to buy something, kept separate from how much is actually left:
-- a family member can ask for more rice while the jar still holds 500 g.
alter table public.items add column if not exists needed boolean not null default false;

-- Buying an item answers the request, whoever logs it. Folded into the existing
-- stock trigger so the flag clears server-side, exactly like current_qty does.
create or replace function public.apply_purchase_to_stock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.items
      set current_qty = current_qty + new.qty,
          needed = false
      where id = new.item_id;
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
