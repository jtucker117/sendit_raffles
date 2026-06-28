# Supabase — free-for-all + BOGO game modes

Two host-toggled options (on top of the normal "N free seats"):

- **`free_for_all`** — every player can claim **1 free seat** (unlimited free pool,
  still 1 per person).
- **`bogo`** — buy one, get one free: when the host **confirms** a player's paid
  seat, the player is automatically granted a free seat.

Run once. Safe to re-run. (This `claim_seat` supersedes the one in
SUPABASE_FREE_RESERVE.md — run this version.)

```sql
alter table raffles add column if not exists free_for_all boolean not null default false;
alter table raffles add column if not exists bogo boolean not null default false;

create or replace function public.claim_seat(p_raffle uuid, p_seat int, p_type text)
returns int language plpgsql security definer set search_path = public as $$
declare v_cap int; v_free int; v_fa boolean; v_used_free int; v_my_free int; v_used_paid int; v_seat int;
begin
  if not exists (select 1 from raffles r where r.id = p_raffle and (
        r.host_id = auth.uid() or public.is_superadmin()
        or exists (select 1 from host_followers f where f.host_id = r.host_id and f.follower_id = auth.uid())))
  then raise exception 'No access to this game'; end if;

  select capacity, coalesce(free_seat_limit, 0), coalesce(free_for_all, false)
    into v_cap, v_free, v_fa from raffles where id = p_raffle;

  if p_type = 'free' then
    select count(*) into v_my_free from tickets where raffle_id = p_raffle and type = 'free' and owner_id = auth.uid();
    if v_my_free >= 1 then raise exception 'Only 1 free seat per player'; end if;
    if v_fa then
      -- unlimited free pool; next free seat number above the paid block
      select coalesce(max(seat_number), v_cap) + 1 into v_seat from tickets where raffle_id = p_raffle and seat_number > v_cap;
    else
      if v_free <= 0 then raise exception 'This game has no free seats'; end if;
      select count(*) into v_used_free from tickets where raffle_id = p_raffle and type = 'free';
      if v_used_free >= v_free then raise exception 'No free seats left'; end if;
      select s into v_seat from generate_series(v_cap + 1, v_cap + v_free) s
        where not exists (select 1 from tickets t where t.raffle_id = p_raffle and t.seat_number = s)
        order by s limit 1;
      if v_seat is null then raise exception 'No free seats left'; end if;
    end if;
  else
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

-- BOGO: when a paid seat is confirmed in a bogo game, grant the owner a free seat.
create or replace function public.grant_bogo_seat()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cap int; v_bogo boolean; v_seat int;
begin
  if new.status = 'confirmed' and (old.status is distinct from 'confirmed') and new.type = 'paid' then
    select capacity, coalesce(bogo, false) into v_cap, v_bogo from raffles where id = new.raffle_id;
    if v_bogo then
      select coalesce(max(seat_number), v_cap) + 1 into v_seat from tickets where raffle_id = new.raffle_id and seat_number > v_cap;
      insert into tickets(raffle_id, seat_number, owner_id, type, status)
        values (new.raffle_id, v_seat, new.owner_id, 'free', 'confirmed');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_bogo on tickets;
create trigger trg_bogo after update on tickets for each row execute function public.grant_bogo_seat();
```
