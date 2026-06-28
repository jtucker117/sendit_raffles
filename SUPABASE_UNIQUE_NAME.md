# Supabase — unique display names

Display names must be unique (case-insensitive) so there are no duplicates.
Run once. If it errors because duplicates already exist, fix/rename those rows
first, then re-run.

```sql
-- Find any existing duplicates first (optional check):
-- select lower(display_name), count(*) from profiles group by 1 having count(*) > 1;

create unique index if not exists profiles_display_name_unique
  on profiles (lower(display_name));

-- Check availability before sign-up / rename (callable by anyone, even signed-out).
create or replace function public.name_available(p_name text)
returns boolean language sql security definer set search_path = public as $$
  select not exists (
    select 1 from profiles
    where lower(display_name) = lower(trim(p_name))
      and id is distinct from auth.uid()  -- ignore your own row when renaming
  );
$$;
```
