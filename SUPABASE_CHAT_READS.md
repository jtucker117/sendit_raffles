# Supabase — unread tracking for group & room chats

Direct messages already have `read_at`. Group chats (per-host) and the permanent
platform rooms don't, so this adds a tiny per-user "last read" table. A chat is
**unread** if its newest message is later than the user's last_read for it.
Run once. Safe to re-run.

```sql
create table if not exists public.chat_reads (
  user_id uuid not null references profiles(id) on delete cascade,
  room_key text not null,            -- 'host:<hostId>' | 'room:everyone' | 'room:hosts'
  last_read_at timestamptz not null default now(),
  primary key (user_id, room_key)
);

alter table chat_reads enable row level security;
drop policy if exists chat_reads_rw on chat_reads;
create policy chat_reads_rw on chat_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```
