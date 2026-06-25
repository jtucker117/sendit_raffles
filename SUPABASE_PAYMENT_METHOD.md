# Supabase — record how a paid seat was paid

Run once in **Supabase → SQL Editor**. Adds a column to remember which method
the host used to confirm a paid seat (Venmo / Cash App / Card / PayPal / Zelle).
This is for the host's own record-keeping — automated payment *processing* is a
separate, later feature. Safe to re-run.

```sql
alter table tickets add column if not exists paid_method text;
alter table tickets add column if not exists paid_at timestamptz;
```

After running this, confirming a pending seat lets the host pick the method, and
it shows on the confirmed entry.
