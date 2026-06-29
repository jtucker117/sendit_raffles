# Supabase — fix minis drawn on the OLD draw function

The old `draw` edge function awarded a mini winner the **lowest open seats**
(e.g. #1/#3/#6) instead of transferring the seats that were **reserved** for that
mini (e.g. #2/#4/#5). Use this for any mini drawn before the new `draw` function
went live.

It does two things, in order:
1. **Removes** the wrong prize seats the old function granted — free tickets the
   mini's winner got inside the paid block (`mini_id IS NULL`, `seat_number <=
   capacity`). Real BOGO/free-for-all seats are numbered ABOVE capacity, so this
   never deletes a legitimately claimed free seat.
2. **Transfers** the seats that were reserved for that mini to the winner, so the
   parent board/Players list shows the winner on those exact seats.

Run once in **Supabase → SQL Editor**. Safe to re-run (only touches completed
minis whose reserved seats are still unassigned).

```sql
-- 1) Undo the old fallback grant (winner's free seats inside the paid block).
delete from tickets t
using raffles m, draws d, raffles p
where m.parent_raffle_id is not null
  and m.status = 'complete'
  and d.raffle_id = m.id
  and p.id = m.parent_raffle_id
  and t.raffle_id = m.parent_raffle_id
  and t.owner_id = d.winner_id
  and t.type = 'free'
  and t.mini_id is null
  and t.seat_number <= p.capacity
  and exists (
    select 1 from tickets r
    where r.raffle_id = m.parent_raffle_id and r.mini_id = m.id and r.status = 'reserved'
  );

-- 2) Hand the reserved seats to the mini's winner.
update tickets t
set owner_id = d.winner_id,
    type = 'free',
    status = 'confirmed'
from raffles m, draws d
where m.parent_raffle_id is not null
  and m.status = 'complete'
  and d.raffle_id = m.id
  and t.raffle_id = m.parent_raffle_id
  and t.mini_id = m.id
  and t.status = 'reserved';
```

After running, refresh the parent game — the Players list will show the winner on
the seats that were reserved for the mini.

## The real fix — redeploy the draw function

The SQL above is cleanup. So future minis transfer automatically, the new `draw`
edge function MUST be deployed. In the Codespace:

```
git pull origin main
supabase functions deploy draw
```

Confirm it deployed (the CLI prints the function URL + a new version). If you draw
a fresh mini afterward and the winner lands on the RESERVED seats (not #1/#3/#6),
it's live.
