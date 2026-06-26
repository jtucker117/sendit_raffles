# Supabase — draw mode (single pick vs multi-round elimination)

Lets the host choose how the winner is decided:
- **single** — one Random.org signed pick (current behavior; uses the wheel /
  scratch / lotto reveal style).
- **elimination** — multiple Random.org signed rounds, each eliminating ~half
  the remaining seats until one survives. Every round is signed/verifiable.

Run once in **Supabase → SQL Editor**. Safe to re-run.

```sql
alter table raffles
  add column if not exists draw_mode text not null default 'single'
  check (draw_mode in ('single','elimination'));

-- per-round elimination data (seats removed each round) for the replay + audit
alter table draws add column if not exists rounds jsonb;
```
