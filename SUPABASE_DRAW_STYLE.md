# Supabase — per-raffle draw reveal style

Lets the host choose how each game's winner is revealed: a spinning **wheel**,
a **scratch-off** card, or a **lotto** number-ball pull. The winner is always
decided by Random.org server-side — the style only changes the animation, which
locks onto that result. Run once in **Supabase → SQL Editor**. Safe to re-run.

```sql
alter table raffles
  add column if not exists draw_style text not null default 'wheel'
  check (draw_style in ('wheel','scratch','lotto'));
```
