# Supabase — Host seat management (confirm paid / remove player / see names)

Run once in **Supabase → SQL Editor**. Adds the two things the host needs to
manage a raffle's seats:

1. The host can **read the display names** of players who follow them (so the
   seat board and pending-payment list show *who* claimed each seat).
2. The host can **delete tickets** in their own raffles (remove / refund a
   player, or reject a pending paid seat).

Confirming a paid seat (`held → confirmed`) already works — the
`tickets host update` policy from the tickets setup allows it. Safe to re-run.

```sql
-- Host can see the profiles of players who follow them (for names on the board)
drop policy if exists "p read my followers" on profiles;
create policy "p read my followers" on profiles for select using (
  exists (select 1 from host_followers f
          where f.host_id = auth.uid() and f.follower_id = profiles.id));

-- Host can remove a ticket from their own raffle (refund / reject)
drop policy if exists "tickets host delete" on tickets;
create policy "tickets host delete" on tickets for delete using (
  exists (select 1 from raffles r
          where r.id = tickets.raffle_id and r.host_id = auth.uid()));
```

That's it — reload the raffle screen and the host will see pending payments to
confirm, names on claimed seats, and a remove option per player.
