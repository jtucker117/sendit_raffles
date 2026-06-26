# Supabase — host payment handles (where players send money)

Payments are host-confirmed off-app, so players need to know *where* to pay.
Hosts add their handles once (on their profile) and Checkout shows the right one.
Run once in **Supabase → SQL Editor**. Safe to re-run.

```sql
alter table profiles add column if not exists pay_venmo  text;
alter table profiles add column if not exists pay_cashapp text;
alter table profiles add column if not exists pay_paypal text;
alter table profiles add column if not exists pay_zelle  text;
```

(Players can already read the profiles of hosts they follow — the existing
`p read followed hosts` policy — so Checkout can show the host's handle.)
