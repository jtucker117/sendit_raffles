# Supabase — per-host referrals

Each user gets a personal `referral_code`. When someone joins a host's group via
an invite link that carries a referrer's code, we record a **referral** scoped to
that host: `(host_id, referrer_id, referred_id)`. A person can only be referred
once per host. Run once in **Supabase → SQL Editor**. Safe to re-run.

```sql
-- 1) Personal referral code for every user (not just hosts).
alter table profiles add column if not exists referral_code text unique;

create or replace function public.gen_referral_code() returns trigger
language plpgsql as $$
begin
  if new.referral_code is null then
    new.referral_code := upper(substr(md5(random()::text), 1, 6));
  end if;
  return new;
end $$;
drop trigger if exists trg_referral_code on profiles;
create trigger trg_referral_code before insert or update on profiles
  for each row execute function public.gen_referral_code();

update profiles set referral_code = upper(substr(md5(random()::text), 1, 6))
  where referral_code is null;

-- 2) Per-host referrals.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles(id) on delete cascade,
  referrer_id uuid not null references profiles(id) on delete cascade,
  referred_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (host_id, referred_id)
);
create index if not exists referrals_host_referrer_idx on referrals(host_id, referrer_id);

alter table referrals enable row level security;
-- You can read referrals you made, referrals into your own group, or (superadmin) all.
drop policy if exists referrals_read on referrals;
create policy referrals_read on referrals for select using (
  referrer_id = auth.uid() or host_id = auth.uid() or public.is_superadmin()
);

-- 3) Join a host by code, optionally crediting a referrer for that host.
create or replace function public.join_host_with_referral(p_host_code text, p_ref_code text)
returns void language plpgsql security definer set search_path = public as $$
declare h uuid; r uuid;
begin
  select id into h from profiles where host_code = upper(p_host_code) and role = 'host';
  if h is null then raise exception 'Invalid host code'; end if;
  insert into host_followers(host_id, follower_id) values (h, auth.uid())
    on conflict do nothing;
  if p_ref_code is not null and length(trim(p_ref_code)) > 0 then
    select id into r from profiles where referral_code = upper(trim(p_ref_code));
    if r is not null and r <> auth.uid() then
      insert into referrals(host_id, referrer_id, referred_id) values (h, r, auth.uid())
        on conflict (host_id, referred_id) do nothing;
    end if;
  end if;
end $$;

-- 4) Lazily ensure the caller has a referral code; returns it.
create or replace function public.ensure_referral_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  select referral_code into c from profiles where id = auth.uid();
  if c is null then
    c := upper(substr(md5(random()::text), 1, 6));
    update profiles set referral_code = c where id = auth.uid();
  end if;
  return c;
end $$;

-- 5) Count a player's referrals for a given host (used by giveaway free entries).
create or replace function public.my_referral_count(p_host uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from referrals where host_id = p_host and referrer_id = auth.uid();
$$;
```
