# Supabase — show winning odds toggle

Lets a host choose whether players see their odds of winning on a game.
Run once. Safe to re-run.

```sql
alter table raffles add column if not exists show_odds boolean not null default true;
```

Also confirms the one-free-seat rule is already enforced in `claim_seat`
(see SUPABASE_FREE_RESERVE.md): a player's 2nd free claim raises
"Only 1 free seat per player". No change needed there.
