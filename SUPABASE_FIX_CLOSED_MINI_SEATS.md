# Supabase — retroactively hand a closed mini's reserved seats to its winner

Use this ONLY for minis that were drawn **before** the new `draw` edge function
was deployed. Those draws never transferred the parent's reserved seats to the
winner, so the parent's Seats list still shows "Held for a mini" instead of the
winner's name.

This finds every completed mini whose reserved parent seats are still sitting in
`reserved` status and reassigns them to that mini's recorded winner.

Run once in **Supabase → SQL Editor**. Safe to re-run (only touches seats that
are still `reserved`).

```sql
update tickets t
set owner_id = d.winner_id,
    type = 'free',
    status = 'confirmed'
from raffles m
join draws d on d.raffle_id = m.id
where m.parent_raffle_id is not null      -- m is a mini
  and m.status = 'complete'               -- the mini was drawn
  and t.raffle_id = m.parent_raffle_id    -- seat lives on the parent
  and t.mini_id = m.id                    -- reserved for THIS mini
  and t.status = 'reserved';              -- not yet handed out
```

After running, the parent game's Manage → Seats list (and the entries list on the
game page) will show the winner's name on those seats. Going forward, the
redeployed `draw` function does this automatically — `supabase functions deploy draw`.
