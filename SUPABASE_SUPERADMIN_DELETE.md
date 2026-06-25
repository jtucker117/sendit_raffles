# Supabase — only the superadmin can delete a raffle

Hosts can **cancel** a raffle (it stays on the feed marked canceled). Permanently
**deleting** a raffle is reserved for the superadmin. Run once in
**Supabase → SQL Editor**. Safe to re-run.

Deleting a raffle cascades to its tickets and draws (foreign keys are
`on delete cascade`).

```sql
drop policy if exists "raffles super delete" on raffles;
create policy "raffles super delete" on raffles for delete using (public.is_superadmin());
```
