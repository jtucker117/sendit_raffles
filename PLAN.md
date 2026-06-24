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
- **Host** — create raffles, manage entries/prizes, share a join code, run the
  draw, show verification.
- **Player** — sign in, join via code, watch the draw live, see if they won,
  verify the result.

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
- `raffles` (id, host_id, title, join_code, status: draft|open|drawing|complete, created_at)
- `entries` (id, raffle_id, player_id, label, created_at)
- `draws` (id, raffle_id, winner_entry_id, randomorg_signed_json, verify_url, drawn_at)
- RLS: players see/join open raffles + their own entries; only the host's
  Edge Function writes `draws`.

## Milestones (each shippable)
1. Scaffold + auth (host/player) + create raffle + join by code — **web first**.
2. The wheel + signed draw + verify panel ← the core magic.
3. Realtime live draw for players.
4. Polish + native builds (EAS) → app stores.

## Accounts / keys needed (free tiers)
- GitHub repo (for code + cloud CI)
- Supabase project (URL + anon key for client; service role + Random.org key in Edge Function secrets)
- Random.org API key (Signed API)
- Expo/EAS account (later, for store builds)
- Dev environment: GitHub Codespaces (cloud Node) since there's no local Node toolchain.

## Open question (blocks platform choice)
Are prizes **firearms / firearms-adjacent** (given the SendItGuns connection)?
If so: app-store policies (Apple/Google) heavily restrict firearms apps → lean
**web/PWA first**; plus age verification, geo/jurisdiction rules, and winner
fulfillment via an FFL. The draw engine + wheel are identical either way.
