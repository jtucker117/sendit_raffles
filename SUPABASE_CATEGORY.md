# Supabase — game category

Adds a category to each game so the Browse/Home filter chips work. Run once in
**Supabase → SQL Editor**. Safe to re-run.

```sql
alter table raffles add column if not exists category text;
```
