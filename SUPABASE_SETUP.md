# Supabase Setup Guide for Send It Raffles

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up
2. Create a new project (choose region closest to you)
3. Wait for the project to initialize

## 2. Get Your Credentials

1. Go to **Settings** → **API**
2. Copy your **Project URL** and **anon key**
3. Create a `.env.local` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=your_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## 3. Create Database Tables

Go to the **SQL Editor** in Supabase and run these queries:

### Create `profiles` table (updated with approval status)

```sql
CREATE TABLE profiles (
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
CREATE INDEX idx_profiles_email ON profiles(email);
-- Index for finding pending host approvals
CREATE INDEX idx_profiles_host_pending ON profiles(host_approved) WHERE role = 'host';
```

### Create `host_groups` table (for host organizations)

```sql
CREATE TABLE host_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Host groups can have their own rules, capacity, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_host_groups_owner ON host_groups(owner_id);
```

### Create `group_members` table (hosts in groups)

```sql
CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES host_groups(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, host_id)
);

CREATE INDEX idx_group_members_host ON group_members(host_id);
CREATE INDEX idx_group_members_group ON group_members(group_id);
```

### Create `raffle_comments` table (chat on raffles)

```sql
CREATE TABLE raffle_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL,  -- Will reference raffles table (created later)
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_raffle_comments_raffle ON raffle_comments(raffle_id);
CREATE INDEX idx_raffle_comments_author ON raffle_comments(author_id);
CREATE INDEX idx_raffle_comments_created ON raffle_comments(created_at DESC);
```

### Create `group_messages` table (group chat)

```sql
CREATE TABLE group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES host_groups(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_group_messages_group ON group_messages(group_id);
CREATE INDEX idx_group_messages_author ON group_messages(author_id);
CREATE INDEX idx_group_messages_created ON group_messages(created_at DESC);
```

### Create `direct_messages` table (DMs between users)

```sql
CREATE TABLE direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CHECK (sender_id != recipient_id)  -- Can't message yourself
);

-- Conversation threads (unique pair of sender/recipient)
CREATE INDEX idx_direct_messages_sender ON direct_messages(sender_id);
CREATE INDEX idx_direct_messages_recipient ON direct_messages(recipient_id);
CREATE INDEX idx_direct_messages_created ON direct_messages(created_at DESC);
CREATE INDEX idx_direct_messages_conversation ON direct_messages(
  CASE WHEN sender_id < recipient_id THEN sender_id ELSE recipient_id END,
  CASE WHEN sender_id < recipient_id THEN recipient_id ELSE sender_id END
);
```

### Enable Row Level Security (RLS)

```sql
-- PROFILES TABLE RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- New users can insert their own profile (signup)
CREATE POLICY "Users can insert their own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Players can see other players (for raffle participation)
CREATE POLICY "Players can see all player profiles"
  ON profiles
  FOR SELECT
  USING (role = 'player' OR auth.uid() = id);

-- HOST_GROUPS TABLE RLS
ALTER TABLE host_groups ENABLE ROW LEVEL SECURITY;

-- Only group owner/admins can update group
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
CREATE POLICY "Anyone can read raffle comments"
  ON raffle_comments
  FOR SELECT
  USING (true);  -- Comments visible to all (raffle access controlled at raffle level)

-- Users can create comments
CREATE POLICY "Users can create raffle comments"
  ON raffle_comments
  FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- Users can update their own comments
CREATE POLICY "Users can update own raffle comments"
  ON raffle_comments
  FOR UPDATE
  USING (author_id = auth.uid());

-- Users can delete their own comments
CREATE POLICY "Users can delete own raffle comments"
  ON raffle_comments
  FOR DELETE
  USING (author_id = auth.uid());

-- GROUP_MESSAGES TABLE RLS
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- Group members can read messages
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
CREATE POLICY "Users can update own group messages"
  ON group_messages
  FOR UPDATE
  USING (author_id = auth.uid());

-- Users can delete their own messages
CREATE POLICY "Users can delete own group messages"
  ON group_messages
  FOR DELETE
  USING (author_id = auth.uid());

-- DIRECT_MESSAGES TABLE RLS
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can read their own conversations
CREATE POLICY "Users can read own direct messages"
  ON direct_messages
  FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Users can send messages
CREATE POLICY "Users can send direct messages"
  ON direct_messages
  FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Users can delete their own messages
CREATE POLICY "Users can delete own direct messages"
  ON direct_messages
  FOR DELETE
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());
```

## 4. Enable Email Authentication

1. Go to **Authentication** → **Providers**
2. Make sure **Email** is enabled
3. Configure **Email Settings** if needed (SMTP, templates, etc.)
## 6. Host Approval Workflow

When a user signs up as a "host", they start with `host_approved = null` (pending). An admin must approve them before they can create raffles.

### Approving a Host

1. Go to Supabase **SQL Editor**
2. Run this query to see pending hosts:
   ```sql
   SELECT * FROM profiles WHERE role = 'host' AND host_approved IS NULL;
   ```
3. To approve a host, run:
   ```sql
   SELECT * FROM approve_host('host-uuid-here', true, 'admin-uuid-here');
   ```
4. To reject, run:
   ```sql
   SELECT * FROM approve_host('host-uuid-here', false, 'admin-uuid-here');
   ```

The host will see their approval status in the app (Pending ⏳ → Approved ✅ → or Rejected ❌).

### Future Admin Dashboard

Eventually, you'll want to build an admin dashboard for approving hosts. For now, use the SQL Editor.

## 7. Host Groups & Organization

Approved hosts can create groups and invite other hosts to join:

- **Group Owner** — creates and manages the group
- **Group Admins** — manage members
- **Group Members** — participate in the group's raffles

Groups allow hosts to pool resources, share raffles, or run collaborative events.

## 8. Testing Locally

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the full testing guide above.

## Test Workflow

1. Sign up as a **Player** — immediately ready to browse raffles
2. Sign up as a **Host** — shows "Approval Pending"
3. Approve the host via SQL (step 6 above)
4. Host can now create groups and raffles
## 5. Test It Out

```bash
npm run web
```

Then:
1. **Sign up** with an email and password
2. Check your email for verification link (development mode may skip this)
3. Sign in with your credentials
4. You should see your profile info on the home screen

## 6. Security Best Practices

✅ **What we've implemented:**
- Passwords encrypted with bcrypt (Supabase handles this)
- Row-level security (RLS) policies enforced server-side
- No plaintext passwords stored
- Email verification required for signups
- Session management via Supabase Auth
- Type-safe database queries

🔒 **Additional hardening (for production):**
- Enable 2FA on your Supabase account
- Set up custom JWT claims for roles
- Use environment variables for sensitive keys
- Implement rate limiting on auth endpoints
- Regular security audits of RLS policies
- Enable database backups
- Monitor auth logs for suspicious activity

## Troubleshooting

**"Unable to find my Supabase URL"**
- Go to Settings → API → Project URL

**"Sign up succeeds but profile not created"**
- Check that `profiles` table RLS policies are correctly set
- Verify the auth trigger is firing (check Auth logs in Supabase)

**"Can't see other user profiles"**
- This is by design (RLS restricts access). To change, modify the policy.

**"Getting CORS errors"**
- Ensure your Supabase URL is correctly set in `.env.local`

## Next Steps

After auth is working:
1. Create `raffles` table (raffle metadata)
2. Create `tickets` table (seat assignments)
3. Create `draws` table (draw results with Random.org verification)
4. Build the raffle creation UI for hosts
5. Build the seat board UI for players
