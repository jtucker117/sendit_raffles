# Supabase — one featured game per host per day (beta)

Beta rule: a host can feature **one** game at a time, and can only change it
**once per calendar day**. Featuring a new game un-features the old one.
Superadmin is exempt. (Post-beta this becomes a paid, unlimited feature via a
card processor.) Run once. Safe to re-run.

```sql
alter table profiles add column if not exists last_feature_date date;

create or replace function public.feature_game(p_game uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_host uuid; v_today date := (now())::date; v_last date; v_already uuid;
begin
  select host_id into v_host from raffles where id = p_game;
  if v_host is null then raise exception 'Game not found'; end if;
  if v_host <> auth.uid() and not public.is_superadmin() then raise exception 'Not your game'; end if;

  select id into v_already from raffles where host_id = v_host and featured = true limit 1;
  select last_feature_date into v_last from profiles where id = v_host;

  -- Block changing the featured game more than once per day (superadmin exempt).
  if not public.is_superadmin() and v_already is not null and v_already <> p_game and v_last = v_today then
    raise exception 'You can feature one game per day. You can change it after midnight.';
  end if;

  update raffles set featured = false where host_id = v_host and id <> p_game;
  update raffles set featured = true where id = p_game;
  update profiles set last_feature_date = v_today where id = v_host;
end $$;
```
