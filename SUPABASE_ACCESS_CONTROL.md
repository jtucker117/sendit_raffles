# Supabase — Superadmin & code-gated access

Run this once in **Supabase → SQL Editor**. It adds:
- a **superadmin** overlay (sees/supervises everything),
- per-host **host codes** (players need one to see a host's raffles),
- per-group **join codes** (hosts need one to join/see another group),
- the join RPCs the app calls, and the RLS to enforce it all.

```sql
-- ========== SUPERADMIN ==========
alter table profiles add column if not exists is_superadmin boolean not null default false;

-- SECURITY DEFINER so it reads the flag without tripping profiles' own RLS
create or replace function public.is_superadmin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_superadmin from profiles where id = auth.uid()), false);
$$;

-- ========== HOST CODES (players follow a host via code) ==========
alter table profiles add column if not exists host_code text unique;

create or replace function public.gen_host_code() returns trigger
language plpgsql as $$
begin
  if new.role = 'host' and new.host_code is null then
    new.host_code := upper(substr(md5(random()::text), 1, 6));
  end if;
  return new;
end $$;
drop trigger if exists trg_host_code on profiles;
create trigger trg_host_code before insert or update on profiles
  for each row execute function public.gen_host_code();

update profiles set host_code = upper(substr(md5(random()::text),1,6))
  where role='host' and host_code is null;

create table if not exists host_followers (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles(id) on delete cascade,
  follower_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(host_id, follower_id)
);
alter table host_followers enable row level security;
create policy "hf read" on host_followers for select
  using (follower_id = auth.uid() or host_id = auth.uid() or public.is_superadmin());
create policy "hf insert self" on host_followers for insert with check (follower_id = auth.uid());
create policy "hf delete self" on host_followers for delete using (follower_id = auth.uid());

-- a player redeems a host code to follow that host
create or replace function public.join_host_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select id into h from profiles where host_code = upper(p_code) and role = 'host';
  if h is null then raise exception 'Invalid host code'; end if;
  insert into host_followers(host_id, follower_id) values (h, auth.uid())
    on conflict (host_id, follower_id) do nothing;
  return h;
end $$;

-- ========== GROUP JOIN CODES (hosts join another group via code) ==========
alter table host_groups add column if not exists join_code text unique;

create or replace function public.gen_group_code() returns trigger
language plpgsql as $$
begin
  if new.join_code is null then
    new.join_code := upper(substr(md5(random()::text), 1, 6));
  end if;
  return new;
end $$;
drop trigger if exists trg_group_code on host_groups;
create trigger trg_group_code before insert on host_groups
  for each row execute function public.gen_group_code();

update host_groups set join_code = upper(substr(md5(random()::text),1,6)) where join_code is null;

-- a host redeems a group code to join that group
create or replace function public.join_group_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if not exists (select 1 from profiles where id=auth.uid() and role='host' and host_approved=true) then
    raise exception 'Only approved hosts can join groups';
  end if;
  select id into g from host_groups where join_code = upper(p_code);
  if g is null then raise exception 'Invalid group code'; end if;
  insert into group_members(group_id, host_id, role) values (g, auth.uid(), 'member')
    on conflict (group_id, host_id) do nothing;
  return g;
end $$;

-- ========== CODE-GATED VISIBILITY + SUPERADMIN BYPASS ==========
-- players see a host's profile only if they follow them; superadmin sees all
create policy "p read followed hosts" on profiles for select using (
  role='host' and exists (select 1 from host_followers f where f.host_id = profiles.id and f.follower_id = auth.uid()));
create policy "p read superadmin" on profiles for select using (public.is_superadmin());

-- raffles: visible to the host, their followers, or superadmin (was public)
drop policy if exists "raffles public read" on raffles;
create policy "raffles read gated" on raffles for select using (
  host_id = auth.uid()
  or public.is_superadmin()
  or exists (select 1 from host_followers f where f.host_id = raffles.host_id and f.follower_id = auth.uid()));

-- superadmin can read everything else for oversight
create policy "hg super read"   on host_groups     for select using (public.is_superadmin());
create policy "gm super read"   on group_members   for select using (public.is_superadmin());
create policy "gmsg super read" on group_messages  for select using (public.is_superadmin());
create policy "dm super read"   on direct_messages for select using (public.is_superadmin());
create policy "rc super read"   on raffle_comments for select using (public.is_superadmin());
```

## Make yourself the superadmin
1. **Sign up** in the app first (any role) with your email.
2. Run this (replace the email):
```sql
update profiles set is_superadmin = true where email = 'YOUR_EMAIL_HERE';
```
3. Sign out/in — you'll see the **Admin** button (all accounts).
