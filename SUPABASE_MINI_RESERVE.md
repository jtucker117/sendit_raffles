# Supabase — minis reserve parent seats on creation

When a mini is created it should immediately **lock random seats in the parent
game** (one per seat the mini awards) so nobody else can claim them. The reserved
seats are held tickets (status `reserved`, owned by the host) — they show as taken
on the board, are excluded from the parent draw (which only uses `confirmed`),
and will be handed to the mini winner later. Run once. Safe to re-run.

```sql
alter table tickets add column if not exists mini_id uuid references raffles(id) on delete cascade;

-- Allow the new 'reserved' status (the status column had a CHECK of just held/confirmed).
alter table tickets drop constraint if exists tickets_status_check;
alter table tickets add constraint tickets_status_check check (status in ('held','confirmed','reserved'));

create or replace function public.reserve_mini_seats(p_parent uuid, p_mini uuid, p_count int)
returns int language plpgsql security definer set search_path = public as $$
declare v_cap int; v_free int; v_host uuid; v_paid_taken int; v_avail int; v_seat int; v_done int := 0; i int;
begin
  select capacity, coalesce(free_seat_limit, 0), host_id into v_cap, v_free, v_host from raffles where id = p_parent;
  if v_host is null then raise exception 'Parent game not found'; end if;
  if v_host <> auth.uid() and not public.is_superadmin() then raise exception 'Not your game'; end if;
  -- Free seats are separate (numbered above capacity), so the whole paid block is pullable.
  select count(*) into v_paid_taken from tickets where raffle_id = p_parent and type = 'paid';
  v_avail := greatest(0, v_cap - v_paid_taken);
  for i in 1..least(greatest(coalesce(p_count, 0), 0), v_avail) loop
    select s into v_seat from generate_series(1, v_cap) s
      where not exists (select 1 from tickets t where t.raffle_id = p_parent and t.seat_number = s)
      order by random() limit 1;
    exit when v_seat is null;       -- board full, stop
    insert into tickets(raffle_id, seat_number, owner_id, type, status, mini_id)
      values (p_parent, v_seat, v_host, 'paid', 'reserved', p_mini);
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;
```
