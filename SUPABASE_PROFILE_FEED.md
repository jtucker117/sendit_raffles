# Supabase setup — Host profiles (avatar + cover) & Raffles feed

Run this **once** in your Supabase project: **Dashboard → SQL Editor → New query →
paste → Run**. It's additive and safe to re-run.

## 1. Profile photo, cover photo, bio
```sql
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists cover_url  text,
  add column if not exists bio        text;
```

## 2. Storage buckets for the images (public read)
```sql
insert into storage.buckets (id, name, public)
values ('avatars','avatars',true), ('covers','covers',true)
on conflict (id) do nothing;
```

## 3. Storage policies — anyone can view; users manage only their own files
Files are stored under a folder named after the user's id, e.g. `avatars/<uid>/photo.jpg`.
```sql
-- public read
create policy "media public read"
  on storage.objects for select
  using (bucket_id in ('avatars','covers'));

-- upload to your own folder
create policy "media upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','covers')
              and (storage.foldername(name))[1] = auth.uid()::text);

-- update/replace your own files
create policy "media update own"
  on storage.objects for update to authenticated
  using (bucket_id in ('avatars','covers')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- delete your own files
create policy "media delete own"
  on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','covers')
         and (storage.foldername(name))[1] = auth.uid()::text);
```

## 4. Raffles table (backs the host feed = "all their games")
```sql
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
create policy "raffles public read"
  on public.raffles for select using (true);

-- a host manages only their own raffles
create policy "raffles host manage"
  on public.raffles for all to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

-- link the existing raffle_comments table now that raffles exists (optional FK)
-- alter table public.raffle_comments
--   add constraint raffle_comments_raffle_fk
--   foreign key (raffle_id) references public.raffles(id) on delete cascade;
```

After running this, tell me and I'll build the **profile screen (avatar + cover
upload)** and the **host feed page** against these tables.
