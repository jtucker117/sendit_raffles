# Supabase — fix Host Groups (RLS infinite recursion)

The original `host_groups` and `group_members` policies referenced each other,
which Postgres rejects as "infinite recursion detected in policy" — so the
Groups page failed to fetch. This replaces them with clean, non-recursive
policies using SECURITY DEFINER helper functions (which bypass RLS, breaking the
loop). Run once in **Supabase → SQL Editor**. Safe to re-run.

```sql
-- Helpers run with definer rights, so they don't trigger the other table's RLS.
create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and host_id = uid);
$$;

create or replace function public.is_group_owner(gid uuid, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from host_groups where id = gid and owner_id = uid);
$$;

-- Drop ALL existing policies on both tables (names vary across setup scripts).
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'host_groups' loop
    execute format('drop policy if exists %I on public.host_groups', p.policyname);
  end loop;
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'group_members' loop
    execute format('drop policy if exists %I on public.group_members', p.policyname);
  end loop;
end $$;

-- host_groups: you can see groups you own or belong to (superadmin sees all)
create policy "hg select" on host_groups for select using (
  owner_id = auth.uid() or public.is_group_member(id, auth.uid()) or public.is_superadmin()
);
create policy "hg insert" on host_groups for insert with check (owner_id = auth.uid());
create policy "hg update" on host_groups for update using (owner_id = auth.uid() or public.is_superadmin());
create policy "hg delete" on host_groups for delete using (owner_id = auth.uid() or public.is_superadmin());

-- group_members: see your own rows or rows of groups you own
create policy "gm select" on group_members for select using (
  host_id = auth.uid() or public.is_group_owner(group_id, auth.uid()) or public.is_superadmin()
);
create policy "gm insert" on group_members for insert with check (
  host_id = auth.uid() or public.is_group_owner(group_id, auth.uid())
);
create policy "gm delete" on group_members for delete using (
  host_id = auth.uid() or public.is_group_owner(group_id, auth.uid()) or public.is_superadmin()
);
```
