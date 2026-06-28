# Supabase — let recipients mark direct messages read/unread

`direct_messages` had no UPDATE policy, so a recipient setting `read_at` (when
opening a chat, or the read/unread toggle) was silently blocked by RLS and the
message stayed unread. This adds an UPDATE policy for the recipient. Run once.

```sql
drop policy if exists "dm recipient update" on direct_messages;
create policy "dm recipient update" on direct_messages for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
```
