# Supabase — Draw engine & minis

## 1. SQL (run in SQL Editor)
```sql
-- mini raffles: a mini's prize is seat(s) in its parent raffle
alter table raffles add column if not exists parent_raffle_id uuid references raffles(id) on delete cascade;
alter table raffles add column if not exists seats_awarded int not null default 1;

-- a raffle can only be drawn once
create unique index if not exists uniq_one_draw_per_raffle on draws(raffle_id);
```

## 2. Deploy the Edge Function (the provably-fair draw)
The function `draw/` lives in this repo at `supabase/functions/draw/index.ts`. It
holds your Random.org key server-side, calls the **Signed API**, records the
signed certificate, completes the raffle, and (for a mini) awards the winner a
seat in the parent raffle.

**Set the secret** (Supabase → Project Settings → Edge Functions → Secrets, or
`supabase secrets set`):
```
RANDOM_ORG_KEY=<your Random.org API key>
```

**Deploy** — easiest from the Codespace terminal (the Supabase CLI works there):
```
npx supabase login
npx supabase link --project-ref tvvtifnekwihtkkqfwdt
npx supabase functions deploy draw
```
(Or use the Supabase dashboard → Edge Functions → Deploy → paste the file.)

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — no
need to set those.
