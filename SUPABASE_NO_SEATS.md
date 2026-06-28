# Supabase — "no seat numbers" game mode

Some games don't use a seat board — players just choose **how many entries** they
want, and entries are auto-numbered behind the scenes. The draw still picks a
winning number (the entry number). Run once. Safe to re-run.

```sql
alter table raffles add column if not exists no_seats boolean not null default false;
```
