# Supabase — Tickets (seat board) & Draws

Run once in **Supabase → SQL Editor**. Adds the seat/ticket table, the draws
table, the atomic `claim_seat` RPC (enforces capacity, free-seat cap, and
1-free-per-player), and RLS. Safe to re-run.

```sql
-- ===== TICKETS (claimed seats) =====
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references raffles(id) on delete cascade,
  seat_number int not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('free','paid')),
  status text not null default 'held' check (status in ('held','confirmed')),
  created_at timestamptz default now(),
  unique(raffle_id, seat_number)
);
create index if not exists idx_tickets_raffle on tickets(raffle_id);

alter table tickets enable row level security;
-- anyone who can see the raffle can see its seats
drop policy if exists "tickets read" on tickets;
create policy "tickets read" on tickets for select using (
  exists (select 1 from raffles r where r.id = tickets.raffle_id and (
    r.host_id = auth.uid() or public.is_superadmin()
    or exists (select 1 from host_followers f where f.host_id = r.host_id and f.follower_id = auth.uid()))));
-- players can release their own held seat
drop policy if exists "tickets delete own" on tickets;
create policy "tickets delete own" on tickets for delete using (owner_id = auth.uid());
-- host confirms paid seats (held -> confirmed)
drop policy if exists "tickets host update" on tickets;
create policy "tickets host update" on tickets for update using (
  exists (select 1 from raffles r where r.id = tickets.raffle_id and r.host_id = auth.uid()));
-- (inserts happen only via claim_seat() below)

-- ===== CLAIM A SEAT (atomic, enforces the rules) =====
create or replace function public.claim_seat(p_raffle uuid, p_seat int, p_type text)
returns int language plpgsql security definer set search_path = public as $$
declare v_cap int; v_free int; v_used_free int; v_my_free int; v_seat int;
begin
  if not exists (select 1 from raffles r where r.id = p_raffle and (
        r.host_id = auth.uid() or public.is_superadmin()
        or exists (select 1 from host_followers f where f.host_id = r.host_id and f.follower_id = auth.uid())))
  then raise exception 'No access to this raffle'; end if;

  select capacity, free_seat_limit into v_cap, v_free from raffles where id = p_raffle;

  if p_type = 'free' then
    select count(*) into v_used_free from tickets where raffle_id = p_raffle and type = 'free';
    if v_used_free >= v_free then raise exception 'No free seats left'; end if;
    select count(*) into v_my_free from tickets where raffle_id = p_raffle and type = 'free' and owner_id = auth.uid();
    if v_my_free >= 1 then raise exception 'Only 1 free seat per player'; end if;
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

-- ===== DRAWS (signed result; written by the Edge Function later) =====
create table if not exists draws (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references raffles(id) on delete cascade,
  winning_ticket_id uuid references tickets(id),
  winning_seat int,
  winner_id uuid references profiles(id),
  randomorg_signed jsonb,
  verify_url text,
  drawn_at timestamptz default now()
);
alter table draws enable row level security;
drop policy if exists "draws read" on draws;
create policy "draws read" on draws for select using (
  exists (select 1 from raffles r where r.id = draws.raffle_id and (
    r.host_id = auth.uid() or public.is_superadmin()
    or exists (select 1 from host_followers f where f.host_id = r.host_id and f.follower_id = auth.uid()))));
```

After running this, the seat board works. The draw (Part B) comes with the Edge Function.
