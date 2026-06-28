# Supabase — reserve free seats out of capacity

So paid buyers can't gobble up every seat: paid tickets are capped at
**capacity − free_seat_limit**, leaving the free allotment claimable only as
free seats. (e.g. 10 seats / 2 free → at most 8 paid, 2 held for free.)
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

  select capacity, free_seat_limit into v_cap, v_free from raffles where id = p_raffle;

  if p_type = 'free' then
    select count(*) into v_used_free from tickets where raffle_id = p_raffle and type = 'free';
    if v_used_free >= v_free then raise exception 'No free seats left'; end if;
    select count(*) into v_my_free from tickets where raffle_id = p_raffle and type = 'free' and owner_id = auth.uid();
    if v_my_free >= 1 then raise exception 'Only 1 free seat per player'; end if;
  elsif p_type = 'paid' then
    -- free seats are reserved: paid can only fill capacity minus the free allotment
    select count(*) into v_used_paid from tickets where raffle_id = p_raffle and type = 'paid';
    if v_used_paid >= (v_cap - v_free) then raise exception 'No paid seats left — the rest are reserved as free seats'; end if;
  end if;

  if p_seat is not null and p_seat > 0 then
    if p_seat > v_cap then raise exception 'Seat number out of range'; end if;
    if exists (select 1 from tickets where raffle_id = p_raffle and seat_number = p_seat) then raise exception 'That seat is taken'; end if;
    v_seat := p_seat;
  else
    select s into v_seat from generate_series(1, v_cap) s
      where not exists (select 1 from tickets t where t.raffle_id = p_raffle and t.seat_number = s)
      order by random() limit 1;
    if v_seat is null then raise exception 'The board is full'; end if;
  end if;

  insert into tickets(raffle_id, seat_number, owner_id, type, status)
    values (p_raffle, v_seat, auth.uid(), p_type,
            case when p_type = 'free' then 'confirmed' else 'held' end);
  return v_seat;
end $$;
```
