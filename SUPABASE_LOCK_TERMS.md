# Supabase — lock game terms after players enter

Prevents hosts from changing the money/fairness fields once anyone has claimed a
seat: seat price, total seats, free-seat limit, draw mode, draw style. Cosmetic
fields (title, prize, description, cover, category) stay editable. Enforced by a
trigger so it can't be bypassed via the API. Superadmin can still override for
support. Run once in **Supabase → SQL Editor**. Safe to re-run.

```sql
create or replace function public.lock_raffle_terms()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin()
     and exists (select 1 from tickets where raffle_id = new.id) then
    if new.amount_cents    is distinct from old.amount_cents
       or new.capacity        is distinct from old.capacity
       or new.free_seat_limit is distinct from old.free_seat_limit
       or new.draw_mode       is distinct from old.draw_mode
       or new.draw_style      is distinct from old.draw_style then
      raise exception 'Game terms (price, seats, draw type) are locked once players have entered.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_lock_raffle_terms on raffles;
create trigger trg_lock_raffle_terms before update on raffles
  for each row execute function public.lock_raffle_terms();
```
