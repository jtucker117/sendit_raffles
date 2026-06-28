# Supabase — free seats are ADDED ON TOP of paid capacity

New model (replaces the old "carve free out of capacity"):

- **Paid seats** are `capacity`, numbered `1..capacity`.
- **Free seats** are `free_seat_limit` EXTRA seats, numbered `capacity+1 .. capacity+free`.
- So 5 seats + 2 free = **7 total**. Paid buyers can fill all 5 paid seats; the 2
  free seats are a separate first-come pool claimed via the "free seat" button.
- Free seats have no chooseable board position (first come, server-assigned), so
  there's nothing to probe — no free-seat theft.

Replaces `claim_seat`. Run once in **Supabase → SQL Editor**. Safe to re-run.

```sql
create or replace function public.claim_seat(p_raffle uuid, p_seat int, p_type text)
returns int language plpgsql security definer set search_path = public as $$
declare v_cap int; v_free int; v_used_free int; v_my_free int; v_used_paid int; v_seat int;
begin
  if not exists (select 1 from raffles r where r.id = p_raffle and (
        r.host_id = auth.uid() or public.is_superadmin()
        or exists (select 1 from host_followers f where f.host_id = r.host_id and f.follower_id = auth.uid())))
  then raise exception 'No access to this game'; end if;

  select capacity, coalesce(free_seat_limit, 0) into v_cap, v_free from raffles where id = p_raffle;

  if p_type = 'free' then
    if v_free <= 0 then raise exception 'This game has no free seats'; end if;
    select count(*) into v_used_free from tickets where raffle_id = p_raffle and type = 'free';
    if v_used_free >= v_free then raise exception 'No free seats left'; end if;
    select count(*) into v_my_free from tickets where raffle_id = p_raffle and type = 'free' and owner_id = auth.uid();
    if v_my_free >= 1 then raise exception 'Only 1 free seat per player'; end if;
    -- Free seats live above the paid block; assign the next open one.
    select s into v_seat from generate_series(v_cap + 1, v_cap + v_free) s
      where not exists (select 1 from tickets t where t.raffle_id = p_raffle and t.seat_number = s)
      order by s limit 1;
    if v_seat is null then raise exception 'No free seats left'; end if;
  else
    -- Paid seats: the whole capacity is available (free seats are separate now).
    select count(*) into v_used_paid from tickets where raffle_id = p_raffle and type = 'paid';
    if v_used_paid >= v_cap then raise exception 'No paid seats left'; end if;
    if p_seat is not null and p_seat > 0 then
      if p_seat > v_cap then raise exception 'Seat number out of range'; end if;
      if exists (select 1 from tickets where raffle_id = p_raffle and seat_number = p_seat) then raise exception 'That seat is taken'; end if;
      v_seat := p_seat;
    else
      select s into v_seat from generate_series(1, v_cap) s
        where not exists (select 1 from tickets t where t.raffle_id = p_raffle and t.seat_number = s)
        order by random() limit 1;
      if v_seat is null then raise exception 'No paid seats left'; end if;
    end if;
  end if;

  insert into tickets(raffle_id, seat_number, owner_id, type, status)
    values (p_raffle, v_seat, auth.uid(), p_type,
            case when p_type = 'free' then 'confirmed' else 'held' end);
  return v_seat;
end $$;
```
