# Supabase — two permanent platform group chats

Adds two app-wide group chat rooms (separate from per-host groups):

- **`everyone`** — all signed-in users (players + hosts) can read & post. The
  place for anyone to chat or ask questions.
- **`hosts`** — only hosts and the superadmin/creator can read & post. The
  creator ↔ all hosts channel.

Run once in **Supabase → SQL Editor**. Safe to re-run.

```sql
create table if not exists public.platform_chat (
  id uuid primary key default gen_random_uuid(),
  room text not null check (room in ('everyone','hosts')),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists platform_chat_room_idx on public.platform_chat(room, created_at);

alter table public.platform_chat enable row level security;

-- Is the current user a host or the superadmin?
create or replace function public.is_host_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and (p.role = 'host' or p.is_superadmin = true)
  );
$$;

-- Read: everyone-room is open to all; hosts-room only to hosts/admin.
drop policy if exists platform_chat_read on public.platform_chat;
create policy platform_chat_read on public.platform_chat for select
  using ( room = 'everyone' or (room = 'hosts' and public.is_host_or_admin()) );

-- Insert: must be the author, and allowed to post in that room.
drop policy if exists platform_chat_insert on public.platform_chat;
create policy platform_chat_insert on public.platform_chat for insert
  with check (
    author_id = auth.uid()
    and ( room = 'everyone' or (room = 'hosts' and public.is_host_or_admin()) )
  );

-- Delete: author can remove their own; superadmin can moderate anything.
drop policy if exists platform_chat_delete on public.platform_chat;
create policy platform_chat_delete on public.platform_chat for delete
  using ( public.is_superadmin() or author_id = auth.uid() );
```
