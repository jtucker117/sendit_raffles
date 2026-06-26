# Supabase — messaging: announcements + host community chat

Adds the two new channels:
1. **Platform announcements** — superadmin posts; every signed-in user can read.
2. **Host community chat** — one room per host; the host's followers can read,
   and can post only if the host has commenting enabled (`profiles.chat_enabled`).
   The host (and superadmin) can always post.

Direct messages already exist (`direct_messages`). Run once in
**Supabase → SQL Editor**. Safe to re-run.

```sql
-- ===== Platform announcements (superadmin -> everyone) =====
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete set null,
  content text not null,
  created_at timestamptz default now()
);
alter table announcements enable row level security;
drop policy if exists "ann read"  on announcements;
create policy "ann read"  on announcements for select using (auth.uid() is not null);
drop policy if exists "ann write" on announcements;
create policy "ann write" on announcements for insert with check (public.is_superadmin());
drop policy if exists "ann del"   on announcements;
create policy "ann del"   on announcements for delete using (public.is_superadmin());

-- ===== Host community chat (one room per host) =====
alter table profiles add column if not exists chat_enabled boolean not null default true;

create table if not exists host_chat (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  content text not null,
  created_at timestamptz default now()
);
create index if not exists idx_host_chat_host on host_chat(host_id, created_at);
alter table host_chat enable row level security;

-- read: the host, superadmin, or any follower of that host
drop policy if exists "hc read" on host_chat;
create policy "hc read" on host_chat for select using (
  host_id = auth.uid() or public.is_superadmin()
  or exists (select 1 from host_followers f where f.host_id = host_chat.host_id and f.follower_id = auth.uid())
);

-- post: the host (or superadmin) always; followers only when the host enabled commenting
drop policy if exists "hc write" on host_chat;
create policy "hc write" on host_chat for insert with check (
  author_id = auth.uid() and (
    host_id = auth.uid() or public.is_superadmin()
    or (
      exists (select 1 from host_followers f where f.host_id = host_chat.host_id and f.follower_id = auth.uid())
      and exists (select 1 from profiles p where p.id = host_chat.host_id and p.chat_enabled = true)
    )
  )
);

-- delete: the author, the room's host, or superadmin (moderation)
drop policy if exists "hc del" on host_chat;
create policy "hc del" on host_chat for delete using (
  author_id = auth.uid() or host_id = auth.uid() or public.is_superadmin()
);
```
