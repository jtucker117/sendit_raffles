# Supabase — let the superadmin approve/deny host requests

The Approve/Deny buttons update another user's `profiles` row (role +
host_approved). RLS only lets people edit their **own** profile, so the
superadmin's update silently changes 0 rows. This adds an UPDATE policy so the
superadmin can edit any profile. Run once in **Supabase → SQL Editor**.

```sql
drop policy if exists "p superadmin update" on profiles;
create policy "p superadmin update" on profiles for update
  using (public.is_superadmin())
  with check (public.is_superadmin());
```
