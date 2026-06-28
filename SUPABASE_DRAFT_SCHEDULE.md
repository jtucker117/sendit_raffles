# Supabase — draft & scheduled games + "notify me"

Adds two new game states (status is a free-text column, so no enum change needed):

- **`draft`** — saved but not published; only the host sees it.
- **`scheduled`** — goes live at `scheduled_at`; shown publicly with a countdown
  and blurred cover until then. Auto-flips to `open` when the time passes.

Plus a `game_notify` list so players can ask to be told when a game opens.
Run once. Safe to re-run.

```sql
alter table raffles add column if not exists scheduled_at timestamptz;

-- Make sure the new status values are accepted (drop any restrictive CHECK on status).
alter table raffles drop constraint if exists raffles_status_check;

-- Players asking to be notified when a game opens.
create table if not exists public.game_notify (
  raffle_id uuid not null references raffles(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (raffle_id, user_id)
);
alter table game_notify enable row level security;

drop policy if exists game_notify_self on game_notify;
create policy game_notify_self on game_notify for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists game_notify_host_read on game_notify;
create policy game_notify_host_read on game_notify for select using (
  exists (select 1 from raffles r where r.id = game_notify.raffle_id and r.host_id = auth.uid()));

-- Flip due scheduled games to open (call from the app on load; also safe as a cron).
create or replace function public.open_due_games()
returns void language sql security definer set search_path = public as $$
  update raffles set status = 'open'
  where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now();
$$;
```
