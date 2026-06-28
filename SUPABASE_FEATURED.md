# Supabase — featured games + host checkout link

- `raffles.featured` — host marks a game to appear in the home Featured banner.
  (Free during beta; future $10/game handled off-platform via the creator.)
- `profiles.pay_link` — an optional host checkout URL shown to players at checkout,
  alongside the standard Zelle / Cash App / Venmo handles.

Run once. Safe to re-run.

```sql
alter table raffles add column if not exists featured boolean not null default false;
alter table profiles add column if not exists pay_link text;
```
