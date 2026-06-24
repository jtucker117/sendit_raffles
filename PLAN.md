# Send It Raffles — Plan

A raffle app whose whole point is **provable fairness**: draws are decided by
**Random.org's Signed API** (a cryptographically signed random result anyone can
verify), visualized with a **spinning wheel** (like wheelofnames.com). The wheel
is the show; the signed certificate is the proof.

## Why this is different from wheelofnames.com
Wheelofnames spins with the browser's `Math.random()` — you just have to trust
it. We use Random.org's **Signed** API: every draw returns a random number **+ a
signature** that anyone can independently verify on random.org. Even the host
cannot rig the outcome.

## Roles (two logins)
- **Host** — configure a raffle (prize, capacity, seat mode, ticket price),
  open/close ticket sales, run the draw, show verification. **The host can NOT
  manually add people to the wheel** — entries come *only* from purchased
  tickets/seats. This is core to the fairness story.
- **Player** — sign in, browse open raffles, **buy ticket(s)/seat(s)**, watch
  the draw live, see if they won, verify the result.

## Ticketing & seats (host-configurable per raffle)
Entries = purchased tickets only. The host picks one **seat mode** per raffle:
1. **Manual select** — fixed seat board (e.g. 1–100); players pick their own
   open seat number(s), like choosing seats at a venue.
2. **Random assign** — player buys N tickets; the system assigns random seat
   numbers from the remaining open seats.
3. **No seats** — just a quantity of tickets; each ticket is an entry, no
   numbering.

Host also sets **capacity** (total seats/tickets) and **ticket price**. The
**wheel/draw is over the sold tickets** (or sold seats); Random.org's signed
result picks the winning ticket → its owner wins.

## Proposed stack (web + mobile, one codebase)
- **Expo (React Native + Expo Router)** → iOS, Android, and web from one codebase.
- **Supabase** → Auth (host/player roles via a `profiles.role`), Postgres DB,
  Realtime (live draw), Edge Functions (hold the secret Random.org key).
- **Random.org Signed API** → the trust anchor (server-side only).
- **Animated wheel** (Reanimated/Skia) that lands on the Random.org-chosen slot.

## Trust model — how a draw works
1. Players join a raffle → each becomes an `entry`.
2. Host taps **Draw** → a Supabase Edge Function (key hidden) calls Random.org
   `generateSignedIntegers(n=1, min=1, max=N)`.
3. Server maps the signed integer → the winning entry; saves the full signed
   certificate + verification info. **Server-authoritative** — the host only
   triggers the draw, never influences it.
4. All clients watch the wheel land on the winner (synced via Realtime).
5. A **Verify panel** shows the signed payload + one-tap "Verify on Random.org".

## Data model (first cut)
- `profiles` (id, role: host|player, display_name)
- `raffles` (id, host_id, title, prize, seat_mode: manual|random|none,
  capacity, ticket_price_cents, status: draft|open|sold_out|drawing|complete,
  created_at)
- `tickets` (id, raffle_id, owner_id, seat_number nullable, status:
  available|held|sold, purchased_at, payment_ref) — a sold ticket IS an entry;
  `seat_number` is null in "no seats" mode
- `draws` (id, raffle_id, winning_ticket_id, randomorg_signed_json, verify_url,
  drawn_at)
- RLS: players can buy/hold open tickets and read their own + the public raffle
  state; **no one can insert a ticket without a purchase**; only the host's
  Edge Function writes `draws`. Capacity + uniqueness of `seat_number` enforced
  server-side so two players can't grab the same seat.

## Milestones (each shippable)
1. Scaffold + auth (host/player) + host creates a raffle (capacity, seat mode,
   price, prize) — **web first**.
2. Ticketing: players buy seats/tickets (manual board / random / quantity);
   capacity + seat uniqueness enforced server-side.
3. The wheel over sold tickets + signed draw (Random.org) + verify panel ← core magic.
4. Realtime live draw for players.
5. Payments (Stripe) for paid tickets; receipts.
5. Payments → **host-handles model** (see below). 6. Polish + native builds (EAS) → app stores.

## Payments & compliance (decided direction)
- **Model: host payment handles + manual confirm.** The app displays the host's
  own Venmo / Zelle / Cash App / PayPal; the player pays the host **directly,
  off-platform**; the host marks the ticket **confirmed** (optionally with a
  proof screenshot) → ticket issued. **We are a raffle *manager*, not a payment
  processor.** Only confirmed tickets enter the draw (still Random.org-signed).
- **Terminology configurable per raffle:** "Purchase" / "Donation" / "Entry"
  (host's choice of wording).
- **Stripe:** optional, later — only with proper nonprofit/licensed/sweepstakes
  structure (Stripe restricts raffles).
- **Compliance reality (NOT legal advice):** prize + chance + consideration =
  lottery, which is restricted/illegal for for-profits in many states.
  Relabeling a required payment as a "donation" does NOT remove the
  consideration — it's still legally a raffle. The real fix is a **genuine free
  alternate entry (AMOE)**, deferred for now but the data model leaves room
  (a per-raffle `free_entry_enabled` flag). Jordan to verify state rules +
  firearms implications before taking real money.

## Accounts / keys needed (free tiers)
- GitHub repo (for code + cloud CI)
- Supabase project (URL + anon key for client; service role + Random.org key in Edge Function secrets)
- Random.org API key (Signed API) — ✅ Jordan has it. Goes into Supabase Edge
  Function secrets ONLY (never client/chat).
- Stripe account (for paid tickets, Milestone 5)
- Expo/EAS account (later, for store builds)
- Dev environment: GitHub Codespaces (cloud Node) since there's no local Node toolchain.

## Decisions locked
- **Capacity:** host sets it per raffle.
- **Payments:** host-handles + manual confirm (Venmo/Zelle/Cash App/PayPal),
  "Purchase/Donation/Entry" wording configurable. Stripe later/optional.
- **Free seats:** enabled — host sets a **per-raffle cap** on how many seats can
  be claimed free (the rest are paid/donation). This is the genuine free-entry
  path. Data model: `raffles.free_seat_limit`, `tickets.type = free|paid`.

## Still open
- **Firearms prizes?** affects app-store path + age/geo/FFL rules (mixed/unsure
  → build for both, web-first).
- **Legal structure** for paid/donation raffles in Jordan's state(s) — to verify
  before going live with real money.

## Open question (blocks platform choice)
Are prizes **firearms / firearms-adjacent** (given the SendItGuns connection)?
If so: app-store policies (Apple/Google) heavily restrict firearms apps → lean
**web/PWA first**; plus age verification, geo/jurisdiction rules, and winner
fulfillment via an FFL. The draw engine + wheel are identical either way.
