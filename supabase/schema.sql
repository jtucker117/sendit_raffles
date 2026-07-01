-- ============================================================================
-- Send It Raffles (Loot Vault) — CONSOLIDATED DATABASE SCHEMA
-- ----------------------------------------------------------------------------
-- Single source of truth. Consolidated from the old SUPABASE_*.md files.
-- Idempotent: safe to re-run in the Supabase SQL Editor (create ... if not
-- exists, drop policy if exists + create, create or replace function).
-- For a brand-new database run this top-to-bottom (ordered by dependency).
-- The final section is one-time data fixes — harmless on a fresh DB.
-- ============================================================================

-- ============================================================================
-- SUPABASE_SETUP.md
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('host', 'player')),
  -- Host approval: null = pending, false = rejected, true = approved
  host_approved BOOLEAN DEFAULT NULL,
  host_approved_at TIMESTAMP WITH TIME ZONE,
  host_approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
-- Index for finding pending host approvals
CREATE INDEX IF NOT EXISTS idx_profiles_host_pending ON profiles(host_approved) WHERE role = 'host';
CREATE TABLE IF NOT EXISTS host_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Host groups can have their own rules, capacity, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_host_groups_owner ON host_groups(owner_id);
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES host_groups(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, host_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_host ON group_members(host_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE TABLE IF NOT EXISTS raffle_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL,  -- Will reference raffles table (created later)
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raffle_comments_raffle ON raffle_comments(raffle_id);
CREATE INDEX IF NOT EXISTS idx_raffle_comments_author ON raffle_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_raffle_comments_created ON raffle_comments(created_at DESC);
CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES host_groups(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_author ON group_messages(author_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created ON group_messages(created_at DESC);
CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CHECK (sender_id != recipient_id)  -- Can't message yourself
);

-- Conversation threads (unique pair of sender/recipient)
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient ON direct_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_created ON direct_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages(
  CASE WHEN sender_id < recipient_id THEN sender_id ELSE recipient_id END,
  CASE WHEN sender_id < recipient_id THEN recipient_id ELSE sender_id END
);
-- PROFILES TABLE RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- New users can insert their own profile (signup)
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Players can see other players (for raffle participation)
DROP POLICY IF EXISTS "Players can see all player profiles" ON profiles;
CREATE POLICY "Players can see all player profiles"
  ON profiles
  FOR SELECT
  USING (role = 'player' OR auth.uid() = id);

-- HOST_GROUPS TABLE RLS
ALTER TABLE host_groups ENABLE ROW LEVEL SECURITY;

-- Only group owner/admins can update group
DROP POLICY IF EXISTS "Owners and admins can update groups" ON host_groups;
CREATE POLICY "Owners and admins can update groups"
  ON host_groups
  FOR UPDATE
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = host_groups.id
        AND group_members.host_id = auth.uid()
        AND group_members.role IN ('owner', 'admin')
    )
  );

-- Group members can view group
DROP POLICY IF EXISTS "Group members can read groups" ON host_groups;
CREATE POLICY "Group members can read groups"
  ON host_groups
  FOR SELECT
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = host_groups.id
        AND group_members.host_id = auth.uid()
    )
  );

-- Approved hosts can create groups
DROP POLICY IF EXISTS "Approved hosts can create groups" ON host_groups;
CREATE POLICY "Approved hosts can create groups"
  ON host_groups
  FOR INSERT
  WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'host'
        AND profiles.host_approved = true
    )
  );

-- GROUP_MEMBERS TABLE RLS
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Group members can see who is in their groups
DROP POLICY IF EXISTS "Group members can read members" ON group_members;
CREATE POLICY "Group members can read members"
  ON group_members
  FOR SELECT
  USING (
    host_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.host_id = auth.uid()
    )
  );

-- Group admins/owners can manage members
DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;
CREATE POLICY "Group admins can manage members"
  ON group_members
  FOR INSERT
  WITH CHECK (
    -- the group owner can add members (incl. themselves at creation)
    EXISTS (
      SELECT 1 FROM host_groups hg
      WHERE hg.id = group_members.group_id
        AND hg.owner_id = auth.uid()
    )
    -- or an existing owner/admin of the group
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.host_id = auth.uid()
        AND gm.role IN ('owner', 'admin')
    )
  );

-- RAFFLE_COMMENTS TABLE RLS
ALTER TABLE raffle_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments on a raffle they can access
DROP POLICY IF EXISTS "Anyone can read raffle comments" ON raffle_comments;
CREATE POLICY "Anyone can read raffle comments"
  ON raffle_comments
  FOR SELECT
  USING (true);  -- Comments visible to all (raffle access controlled at raffle level)

-- Users can create comments
DROP POLICY IF EXISTS "Users can create raffle comments" ON raffle_comments;
CREATE POLICY "Users can create raffle comments"
  ON raffle_comments
  FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- Users can update their own comments
DROP POLICY IF EXISTS "Users can update own raffle comments" ON raffle_comments;
CREATE POLICY "Users can update own raffle comments"
  ON raffle_comments
  FOR UPDATE
  USING (author_id = auth.uid());

-- Users can delete their own comments
DROP POLICY IF EXISTS "Users can delete own raffle comments" ON raffle_comments;
CREATE POLICY "Users can delete own raffle comments"
  ON raffle_comments
  FOR DELETE
  USING (author_id = auth.uid());

-- GROUP_MESSAGES TABLE RLS
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- Group members can read messages
DROP POLICY IF EXISTS "Group members can read group messages" ON group_messages;
CREATE POLICY "Group members can read group messages"
  ON group_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_messages.group_id
        AND group_members.host_id = auth.uid()
    )
  );

-- Group members can post messages
DROP POLICY IF EXISTS "Group members can post messages" ON group_messages;
CREATE POLICY "Group members can post messages"
  ON group_messages
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_messages.group_id
        AND group_members.host_id = auth.uid()
    )
  );

-- Users can update their own messages
DROP POLICY IF EXISTS "Users can update own group messages" ON group_messages;
CREATE POLICY "Users can update own group messages"
  ON group_messages
  FOR UPDATE
  USING (author_id = auth.uid());

-- Users can delete their own messages
DROP POLICY IF EXISTS "Users can delete own group messages" ON group_messages;
CREATE POLICY "Users can delete own group messages"
  ON group_messages
  FOR DELETE
  USING (author_id = auth.uid());

-- DIRECT_MESSAGES TABLE RLS
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can read their own conversations
DROP POLICY IF EXISTS "Users can read own direct messages" ON direct_messages;
CREATE POLICY "Users can read own direct messages"
  ON direct_messages
  FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Users can send messages
DROP POLICY IF EXISTS "Users can send direct messages" ON direct_messages;
CREATE POLICY "Users can send direct messages"
  ON direct_messages
  FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Users can delete their own messages
DROP POLICY IF EXISTS "Users can delete own direct messages" ON direct_messages;
CREATE POLICY "Users can delete own direct messages"
  ON direct_messages
  FOR DELETE
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- ============================================================================
-- SUPABASE_ACCESS_CONTROL.md
-- ============================================================================
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
drop policy if exists "hf read" on host_followers;
create policy "hf read" on host_followers for select
  using (follower_id = auth.uid() or host_id = auth.uid() or public.is_superadmin());
drop policy if exists "hf insert self" on host_followers;
create policy "hf insert self" on host_followers for insert with check (follower_id = auth.uid());
drop policy if exists "hf delete self" on host_followers;
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
drop policy if exists "p read followed hosts" on profiles;
create policy "p read followed hosts" on profiles for select using (
  role='host' and exists (select 1 from host_followers f where f.host_id = profiles.id and f.follower_id = auth.uid()));
drop policy if exists "p read superadmin" on profiles;
create policy "p read superadmin" on profiles for select using (public.is_superadmin());

-- raffles: visible to the host, their followers, or superadmin (was public)
drop policy if exists "raffles public read" on raffles;
drop policy if exists "raffles read gated" on raffles;
create policy "raffles read gated" on raffles for select using (
  host_id = auth.uid()
  or public.is_superadmin()
  or exists (select 1 from host_followers f where f.host_id = raffles.host_id and f.follower_id = auth.uid()));

-- superadmin can read everything else for oversight
drop policy if exists "hg super read" on host_groups;
create policy "hg super read"   on host_groups     for select using (public.is_superadmin());
drop policy if exists "gm super read" on group_members;
create policy "gm super read"   on group_members   for select using (public.is_superadmin());
drop policy if exists "gmsg super read" on group_messages;
create policy "gmsg super read" on group_messages  for select using (public.is_superadmin());
drop policy if exists "dm super read" on direct_messages;
create policy "dm super read"   on direct_messages for select using (public.is_superadmin());
drop policy if exists "rc super read" on raffle_comments;
create policy "rc super read"   on raffle_comments for select using (public.is_superadmin());
update profiles set is_superadmin = true where email = 'YOUR_EMAIL_HERE';

-- ============================================================================
-- SUPABASE_PROFILE_FEED.md
-- ============================================================================
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists cover_url  text,
  add column if not exists bio        text;
insert into storage.buckets (id, name, public)
values ('avatars','avatars',true), ('covers','covers',true)
on conflict (id) do nothing;
-- public read
drop policy if exists "media public read" on storage.objects;
create policy "media public read"
  on storage.objects for select
  using (bucket_id in ('avatars','covers'));

-- upload to your own folder
drop policy if exists "media upload own" on storage.objects;
create policy "media upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','covers')
              and (storage.foldername(name))[1] = auth.uid()::text);

-- update/replace your own files
drop policy if exists "media update own" on storage.objects;
create policy "media update own"
  on storage.objects for update to authenticated
  using (bucket_id in ('avatars','covers')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- delete your own files
drop policy if exists "media delete own" on storage.objects;
create policy "media delete own"
  on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','covers')
         and (storage.foldername(name))[1] = auth.uid()::text);
create table if not exists public.raffles (
  id              uuid primary key default gen_random_uuid(),
  host_id         uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  prize           text,
  description     text,
  cover_url       text,
  capacity        int  not null default 100,   -- up to 1000
  free_seat_limit int  not null default 0,     -- free seats cap (1 per player)
  entry_word      text not null default 'donation', -- donation|purchase|entry
  amount_cents    int  not null default 0,
  status          text not null default 'draft',    -- draft|open|sold_out|drawing|complete
  created_at      timestamptz not null default now()
);

alter table public.raffles enable row level security;

-- anyone can browse raffles
drop policy if exists "raffles public read" on public.raffles;
create policy "raffles public read"
  on public.raffles for select using (true);

-- a host manages only their own raffles
drop policy if exists "raffles host manage" on public.raffles;
create policy "raffles host manage"
  on public.raffles for all to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

-- link the existing raffle_comments table now that raffles exists (optional FK)
-- alter table public.raffle_comments
--   add constraint raffle_comments_raffle_fk
--   foreign key (raffle_id) references public.raffles(id) on delete cascade;

-- ============================================================================
-- SUPABASE_TICKETS_DRAWS.md
-- ============================================================================
-- ===== TICKETS (claimed seats) =====
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references raffles(id) on delete cascade,
  seat_number int not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('free','paid')),
  status text not null default 'held' check (status in ('held','confirmed')),
  created_at timestamptz default now(),
  unique(raffle_id, seat_number)
);
create index if not exists idx_tickets_raffle on tickets(raffle_id);

alter table tickets enable row level security;
-- anyone who can see the raffle can see its seats
drop policy if exists "tickets read" on tickets;
drop policy if exists "tickets read" on tickets;
create policy "tickets read" on tickets for select using (
  exists (select 1 from raffles r where r.id = tickets.raffle_id and (
    r.host_id = auth.uid() or public.is_superadmin()
    or exists (select 1 from host_followers f where f.host_id = r.host_id and f.follower_id = auth.uid()))));
-- players can release their own held seat
drop policy if exists "tickets delete own" on tickets;
drop policy if exists "tickets delete own" on tickets;
create policy "tickets delete own" on tickets for delete using (owner_id = auth.uid());
-- host confirms paid seats (held -> confirmed)
drop policy if exists "tickets host update" on tickets;
drop policy if exists "tickets host update" on tickets;
create policy "tickets host update" on tickets for update using (
  exists (select 1 from raffles r where r.id = tickets.raffle_id and r.host_id = auth.uid()));
-- (inserts happen only via claim_seat() below)

-- ===== CLAIM A SEAT (atomic, enforces the rules) =====
create or replace function public.claim_seat(p_raffle uuid, p_seat int, p_type text)
returns int language plpgsql security definer set search_path = public as $$
declare v_cap int; v_free int; v_used_free int; v_my_free int; v_seat int;
begin
  if not exists (select 1 from raffles r where r.id = p_raffle and (
        r.host_id = auth.uid() or public.is_superadmin()
        or exists (select 1 from host_followers f where f.host_id = r.host_id and f.follower_id = auth.uid())))
  then raise exception 'No access to this raffle'; end if;

  select capacity, free_seat_limit into v_cap, v_free from raffles where id = p_raffle;

  if p_type = 'free' then
    select count(*) into v_used_free from tickets where raffle_id = p_raffle and type = 'free';
    if v_used_free >= v_free then raise exception 'No free seats left'; end if;
    select count(*) into v_my_free from tickets where raffle_id = p_raffle and type = 'free' and owner_id = auth.uid();
    if v_my_free >= 1 then raise exception 'Only 1 free seat per player'; end if;
  end if;

  if p_seat is not null and p_seat > 0 then
    if p_seat > v_cap then raise exception 'Seat number out of range'; end if;
    if exists (select 1 from tickets where raffle_id = p_raffle and seat_number = p_seat) then raise exception 'That seat is taken'; end if;
    v_seat := p_seat;
  else
    select s into v_seat from generate_series(1, v_cap) s
      where not exists (select 1 from tickets t where t.raffle_id = p_raffle and t.seat_number = s)
      order by random() limit 1;
    if v_seat is null then raise exception 'The board is full'; end if;
  end if;

  insert into tickets(raffle_id, seat_number, owner_id, type, status)
    values (p_raffle, v_seat, auth.uid(), p_type,
            case when p_type = 'free' then 'confirmed' else 'held' end);
  return v_seat;
end $$;

-- ===== DRAWS (signed result; written by the Edge Function later) =====
create table if not exists draws (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references raffles(id) on delete cascade,
  winning_ticket_id uuid references tickets(id),
  winning_seat int,
  winner_id uuid references profiles(id),
  randomorg_signed jsonb,
  verify_url text,
  drawn_at timestamptz default now()
);
alter table draws enable row level security;
drop policy if exists "draws read" on draws;
drop policy if exists "draws read" on draws;
create policy "draws read" on draws for select using (
  exists (select 1 from raffles r where r.id = draws.raffle_id and (
    r.host_id = auth.uid() or public.is_superadmin()
    or exists (select 1 from host_followers f where f.host_id = r.host_id and f.follower_id = auth.uid()))));

-- ============================================================================
-- SUPABASE_MESSAGING.md
-- ============================================================================
-- ===== Platform announcements (superadmin -> everyone) =====
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete set null,
  title text,
  image_url text,
  content text not null,
  created_at timestamptz default now()
);
-- if the table already exists from an earlier run, add the new columns:
alter table announcements add column if not exists title text;
alter table announcements add column if not exists image_url text;
alter table announcements enable row level security;
drop policy if exists "ann read"  on announcements;
drop policy if exists "ann read" on announcements;
create policy "ann read"  on announcements for select using (auth.uid() is not null);
drop policy if exists "ann write" on announcements;
drop policy if exists "ann write" on announcements;
create policy "ann write" on announcements for insert with check (public.is_superadmin());
drop policy if exists "ann del"   on announcements;
drop policy if exists "ann del" on announcements;
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
drop policy if exists "hc read" on host_chat;
create policy "hc read" on host_chat for select using (
  host_id = auth.uid() or public.is_superadmin()
  or exists (select 1 from host_followers f where f.host_id = host_chat.host_id and f.follower_id = auth.uid())
);

-- post: the host (or superadmin) always; followers only when the host enabled commenting
drop policy if exists "hc write" on host_chat;
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
drop policy if exists "hc del" on host_chat;
create policy "hc del" on host_chat for delete using (
  author_id = auth.uid() or host_id = auth.uid() or public.is_superadmin()
);

-- ============================================================================
-- SUPABASE_HOST_MANAGE.md
-- ============================================================================
-- Host can see the profiles of players who follow them (for names on the board)
drop policy if exists "p read my followers" on profiles;
drop policy if exists "p read my followers" on profiles;
create policy "p read my followers" on profiles for select using (
  exists (select 1 from host_followers f
          where f.host_id = auth.uid() and f.follower_id = profiles.id));

-- Host can remove a ticket from their own raffle (refund / reject)
drop policy if exists "tickets host delete" on tickets;
drop policy if exists "tickets host delete" on tickets;
create policy "tickets host delete" on tickets for delete using (
  exists (select 1 from raffles r
          where r.id = tickets.raffle_id and r.host_id = auth.uid()));

-- ============================================================================
-- SUPABASE_PROFILE_VISIBILITY.md
-- ============================================================================
-- A player can read the profile of anyone who shares a host they follow.
drop policy if exists "p read co-followers" on profiles;
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

-- ============================================================================
-- SUPABASE_CATEGORY.md
-- ============================================================================
alter table raffles add column if not exists category text;

-- ============================================================================
-- SUPABASE_LOCK_TERMS.md
-- ============================================================================
create or replace function public.lock_raffle_terms()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin()
     and exists (select 1 from tickets where raffle_id = new.id) then
    if new.amount_cents    is distinct from old.amount_cents
       or new.capacity        is distinct from old.capacity
       or new.free_seat_limit is distinct from old.free_seat_limit
       or new.draw_mode       is distinct from old.draw_mode
       or new.draw_style      is distinct from old.draw_style then
      raise exception 'Game terms (price, seats, draw type) are locked once players have entered.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_lock_raffle_terms on raffles;
create trigger trg_lock_raffle_terms before update on raffles
  for each row execute function public.lock_raffle_terms();

-- ============================================================================
-- SUPABASE_DRAW_MODE.md
-- ============================================================================
alter table raffles
  add column if not exists draw_mode text not null default 'single'
  check (draw_mode in ('single','elimination'));

-- per-round elimination data (seats removed each round) for the replay + audit
alter table draws add column if not exists rounds jsonb;

-- ============================================================================
-- SUPABASE_DRAW_STYLE.md
-- ============================================================================
alter table raffles
  add column if not exists draw_style text not null default 'wheel'
  check (draw_style in ('wheel','scratch','lotto'));

-- ============================================================================
-- SUPABASE_DRAW.md
-- ============================================================================
-- mini raffles: a mini's prize is seat(s) in its parent raffle
alter table raffles add column if not exists parent_raffle_id uuid references raffles(id) on delete cascade;
alter table raffles add column if not exists seats_awarded int not null default 1;

-- a raffle can only be drawn once
create unique index if not exists uniq_one_draw_per_raffle on draws(raffle_id);

-- ============================================================================
-- SUPABASE_PAYMENT_HANDLES.md
-- ============================================================================
alter table profiles add column if not exists pay_venmo  text;
alter table profiles add column if not exists pay_cashapp text;
alter table profiles add column if not exists pay_paypal text;
alter table profiles add column if not exists pay_zelle  text;

-- ============================================================================
-- SUPABASE_PAYMENT_METHOD.md
-- ============================================================================
alter table tickets add column if not exists paid_method text;
alter table tickets add column if not exists paid_at timestamptz;

-- ============================================================================
-- SUPABASE_FREE_RESERVE.md
-- ============================================================================
create or replace function public.claim_seat(p_raffle uuid, p_seat int, p_type text)
returns int language plpgsql security definer set search_path = public as $$
declare v_cap int; v_free int; v_used_free int; v_my_free int; v_used_paid int; v_seat int;
begin
  if not exists (select 1 from raffles r where r.id = p_raffle and (
        r.host_id = auth.uid() or public.is_superadmin()
        or exists (select 1 from host_followers f where f.host_id = r.host_id and f.follower_id = auth.uid())))
  then raise exception 'No access to this game'; end if;

  select capacity, coalesce(free_seat_limit, 0) into v_cap, v_free from raffles where id = p_raffle;

  if p_type = 'free' then
    if v_free <= 0 then raise exception 'This game has no free seats'; end if;
    select count(*) into v_used_free from tickets where raffle_id = p_raffle and type = 'free';
    if v_used_free >= v_free then raise exception 'No free seats left'; end if;
    select count(*) into v_my_free from tickets where raffle_id = p_raffle and type = 'free' and owner_id = auth.uid();
    if v_my_free >= 1 then raise exception 'Only 1 free seat per player'; end if;
    -- Free seats live above the paid block; assign the next open one.
    select s into v_seat from generate_series(v_cap + 1, v_cap + v_free) s
      where not exists (select 1 from tickets t where t.raffle_id = p_raffle and t.seat_number = s)
      order by s limit 1;
    if v_seat is null then raise exception 'No free seats left'; end if;
  else
    -- Paid seats: the whole capacity is available (free seats are separate now).
    select count(*) into v_used_paid from tickets where raffle_id = p_raffle and type = 'paid';
    if v_used_paid >= v_cap then raise exception 'No paid seats left'; end if;
    if p_seat is not null and p_seat > 0 then
      if p_seat > v_cap then raise exception 'Seat number out of range'; end if;
      if exists (select 1 from tickets where raffle_id = p_raffle and seat_number = p_seat) then raise exception 'That seat is taken'; end if;
      v_seat := p_seat;
    else
      select s into v_seat from generate_series(1, v_cap) s
        where not exists (select 1 from tickets t where t.raffle_id = p_raffle and t.seat_number = s)
        order by random() limit 1;
      if v_seat is null then raise exception 'No paid seats left'; end if;
    end if;
  end if;

  insert into tickets(raffle_id, seat_number, owner_id, type, status)
    values (p_raffle, v_seat, auth.uid(), p_type,
            case when p_type = 'free' then 'confirmed' else 'held' end);
  return v_seat;
end $$;

-- ============================================================================
-- SUPABASE_MINI_RESERVE.md
-- ============================================================================
alter table tickets add column if not exists mini_id uuid references raffles(id) on delete cascade;

-- Allow the new 'reserved' status (the status column had a CHECK of just held/confirmed).
alter table tickets drop constraint if exists tickets_status_check;
alter table tickets add constraint tickets_status_check check (status in ('held','confirmed','reserved'));

create or replace function public.reserve_mini_seats(p_parent uuid, p_mini uuid, p_count int)
returns int language plpgsql security definer set search_path = public as $$
declare v_cap int; v_free int; v_host uuid; v_paid_taken int; v_avail int; v_seat int; v_done int := 0; i int;
begin
  select capacity, coalesce(free_seat_limit, 0), host_id into v_cap, v_free, v_host from raffles where id = p_parent;
  if v_host is null then raise exception 'Parent game not found'; end if;
  if v_host <> auth.uid() and not public.is_superadmin() then raise exception 'Not your game'; end if;
  -- Free seats are separate (numbered above capacity), so the whole paid block is pullable.
  select count(*) into v_paid_taken from tickets where raffle_id = p_parent and type = 'paid';
  v_avail := greatest(0, v_cap - v_paid_taken);
  for i in 1..least(greatest(coalesce(p_count, 0), 0), v_avail) loop
    select s into v_seat from generate_series(1, v_cap) s
      where not exists (select 1 from tickets t where t.raffle_id = p_parent and t.seat_number = s)
      order by random() limit 1;
    exit when v_seat is null;       -- board full, stop
    insert into tickets(raffle_id, seat_number, owner_id, type, status, mini_id)
      values (p_parent, v_seat, v_host, 'paid', 'reserved', p_mini);
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;

-- ============================================================================
-- SUPABASE_ODDS.md
-- ============================================================================
alter table raffles add column if not exists show_odds boolean not null default true;

-- ============================================================================
-- SUPABASE_FEATURED.md
-- ============================================================================
alter table raffles add column if not exists featured boolean not null default false;
alter table profiles add column if not exists pay_link text;

-- ============================================================================
-- SUPABASE_FEATURE_LIMIT.md
-- ============================================================================
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

-- ============================================================================
-- SUPABASE_DRAFT_SCHEDULE.md
-- ============================================================================
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

-- ============================================================================
-- SUPABASE_FREE_MODES.md
-- ============================================================================
alter table raffles add column if not exists free_for_all boolean not null default false;
alter table raffles add column if not exists bogo boolean not null default false;

create or replace function public.claim_seat(p_raffle uuid, p_seat int, p_type text)
returns int language plpgsql security definer set search_path = public as $$
declare v_cap int; v_free int; v_fa boolean; v_used_free int; v_my_free int; v_used_paid int; v_seat int;
begin
  if not exists (select 1 from raffles r where r.id = p_raffle and (
        r.host_id = auth.uid() or public.is_superadmin()
        or exists (select 1 from host_followers f where f.host_id = r.host_id and f.follower_id = auth.uid())))
  then raise exception 'No access to this game'; end if;

  select capacity, coalesce(free_seat_limit, 0), coalesce(free_for_all, false)
    into v_cap, v_free, v_fa from raffles where id = p_raffle;

  if p_type = 'free' then
    select count(*) into v_my_free from tickets where raffle_id = p_raffle and type = 'free' and owner_id = auth.uid();
    if v_my_free >= 1 then raise exception 'Only 1 free seat per player'; end if;
    if v_fa then
      -- unlimited free pool; next free seat number above the paid block
      select coalesce(max(seat_number), v_cap) + 1 into v_seat from tickets where raffle_id = p_raffle and seat_number > v_cap;
    else
      if v_free <= 0 then raise exception 'This game has no free seats'; end if;
      select count(*) into v_used_free from tickets where raffle_id = p_raffle and type = 'free';
      if v_used_free >= v_free then raise exception 'No free seats left'; end if;
      select s into v_seat from generate_series(v_cap + 1, v_cap + v_free) s
        where not exists (select 1 from tickets t where t.raffle_id = p_raffle and t.seat_number = s)
        order by s limit 1;
      if v_seat is null then raise exception 'No free seats left'; end if;
    end if;
  else
    select count(*) into v_used_paid from tickets where raffle_id = p_raffle and type = 'paid';
    if v_used_paid >= v_cap then raise exception 'No paid seats left'; end if;
    if p_seat is not null and p_seat > 0 then
      if p_seat > v_cap then raise exception 'Seat number out of range'; end if;
      if exists (select 1 from tickets where raffle_id = p_raffle and seat_number = p_seat) then raise exception 'That seat is taken'; end if;
      v_seat := p_seat;
    else
      select s into v_seat from generate_series(1, v_cap) s
        where not exists (select 1 from tickets t where t.raffle_id = p_raffle and t.seat_number = s)
        order by random() limit 1;
      if v_seat is null then raise exception 'No paid seats left'; end if;
    end if;
  end if;

  insert into tickets(raffle_id, seat_number, owner_id, type, status)
    values (p_raffle, v_seat, auth.uid(), p_type,
            case when p_type = 'free' then 'confirmed' else 'held' end);
  return v_seat;
end $$;

-- BOGO: when a paid seat is confirmed in a bogo game, grant the owner a free seat.
create or replace function public.grant_bogo_seat()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cap int; v_bogo boolean; v_seat int;
begin
  if new.status = 'confirmed' and (old.status is distinct from 'confirmed') and new.type = 'paid' then
    select capacity, coalesce(bogo, false) into v_cap, v_bogo from raffles where id = new.raffle_id;
    if v_bogo then
      select coalesce(max(seat_number), v_cap) + 1 into v_seat from tickets where raffle_id = new.raffle_id and seat_number > v_cap;
      insert into tickets(raffle_id, seat_number, owner_id, type, status)
        values (new.raffle_id, v_seat, new.owner_id, 'free', 'confirmed');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_bogo on tickets;
create trigger trg_bogo after update on tickets for each row execute function public.grant_bogo_seat();

-- ============================================================================
-- SUPABASE_NO_SEATS.md
-- ============================================================================
alter table raffles add column if not exists no_seats boolean not null default false;

-- ============================================================================
-- SUPABASE_UNIQUE_NAME.md
-- ============================================================================
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

-- ============================================================================
-- SUPABASE_HOST_APPROVE.md
-- ============================================================================
drop policy if exists "p superadmin update" on profiles;
drop policy if exists "p superadmin update" on profiles;
create policy "p superadmin update" on profiles for update
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ============================================================================
-- SUPABASE_REFERRALS.md
-- ============================================================================
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

-- ============================================================================
-- SUPABASE_CHAT_READS.md
-- ============================================================================
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

-- ============================================================================
-- SUPABASE_DM_READ.md
-- ============================================================================
drop policy if exists "dm recipient update" on direct_messages;
drop policy if exists "dm recipient update" on direct_messages;
create policy "dm recipient update" on direct_messages for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ============================================================================
-- SUPABASE_PLATFORM_GROUPS.md
-- ============================================================================
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

-- ============================================================================
-- SUPABASE_GROUPS_FIX.md
-- ============================================================================
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
drop policy if exists "hg select" on host_groups;
create policy "hg select" on host_groups for select using (
  owner_id = auth.uid() or public.is_group_member(id, auth.uid()) or public.is_superadmin()
);
drop policy if exists "hg insert" on host_groups;
create policy "hg insert" on host_groups for insert with check (owner_id = auth.uid());
drop policy if exists "hg update" on host_groups;
create policy "hg update" on host_groups for update using (owner_id = auth.uid() or public.is_superadmin());
drop policy if exists "hg delete" on host_groups;
create policy "hg delete" on host_groups for delete using (owner_id = auth.uid() or public.is_superadmin());

-- group_members: see your own rows or rows of groups you own
drop policy if exists "gm select" on group_members;
create policy "gm select" on group_members for select using (
  host_id = auth.uid() or public.is_group_owner(group_id, auth.uid()) or public.is_superadmin()
);
drop policy if exists "gm insert" on group_members;
create policy "gm insert" on group_members for insert with check (
  host_id = auth.uid() or public.is_group_owner(group_id, auth.uid())
);
drop policy if exists "gm delete" on group_members;
create policy "gm delete" on group_members for delete using (
  host_id = auth.uid() or public.is_group_owner(group_id, auth.uid()) or public.is_superadmin()
);

-- ============================================================================
-- SUPABASE_SUPERADMIN_DELETE.md
-- ============================================================================
drop policy if exists "raffles super delete" on raffles;
drop policy if exists "raffles super delete" on raffles;
create policy "raffles super delete" on raffles for delete using (public.is_superadmin());

-- ============================================================================
-- SUPABASE_FIX_CLOSED_MINI_SEATS.md
-- ============================================================================
-- 1) Undo the old fallback grant (winner's free seats inside the paid block).
delete from tickets t
using raffles m, draws d, raffles p
where m.parent_raffle_id is not null
  and m.status = 'complete'
  and d.raffle_id = m.id
  and p.id = m.parent_raffle_id
  and t.raffle_id = m.parent_raffle_id
  and t.owner_id = d.winner_id
  and t.type = 'free'
  and t.mini_id is null
  and t.seat_number <= p.capacity
  and exists (
    select 1 from tickets r
    where r.raffle_id = m.parent_raffle_id and r.mini_id = m.id and r.status = 'reserved'
  );

-- 2) Hand the reserved seats to the mini's winner.
update tickets t
set owner_id = d.winner_id,
    type = 'free',
    status = 'confirmed'
from raffles m, draws d
where m.parent_raffle_id is not null
  and m.status = 'complete'
  and d.raffle_id = m.id
  and t.raffle_id = m.parent_raffle_id
  and t.mini_id = m.id
  and t.status = 'reserved';

