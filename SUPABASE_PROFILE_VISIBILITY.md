# Supabase — profile visibility rules

Who can view whose profile:
- **Superadmin** — everyone (already covered by `p read superadmin`).
- **Player → host** — the hosts they follow (already covered by `p read followed hosts`).
- **Player → player** — other players who follow a host they also follow (same
  "group"/community). This adds that rule, which also gates who they can DM.

Run once in **Supabase → SQL Editor**. Safe to re-run.

```sql
-- A player can read the profile of anyone who shares a host they follow.
drop policy if exists "p read co-followers" on profiles;
create policy "p read co-followers" on profiles for select using (
  exists (
    select 1
    from host_followers a
    join host_followers b on a.host_id = b.host_id
    where a.follower_id = auth.uid()
      and b.follower_id = profiles.id
  )
);
```
