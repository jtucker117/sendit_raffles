# Send It Raffles

A provably-fair raffle app. Draws are decided by **Random.org's Signed API**
(cryptographically verifiable randomness) and visualized with a spinning wheel.
Two roles: **Host** and **Player**.

See [PLAN.md](PLAN.md) for architecture, data model, trust model, and milestones.

## Stack
- **Expo (React Native + Expo Router)** — one codebase → iOS, Android, web.
- **Supabase** — auth, Postgres, realtime, edge functions (holds the Random.org key).
- **Random.org Signed API** — the fairness anchor.

## Run it (cloud, no local Node needed)
Open this repo in a **GitHub Codespace**, then:

```bash
npm install
npm run web      # opens the web build; or `npm start` for the dev menu
```

To preview on a phone, install **Expo Go** and run `npm start`, then scan the QR.

## Scripts
- `npm run web` — run in the browser
- `npm start` — Expo dev server (web / iOS / Android)
- `npm run check` — TypeScript typecheck
- `npm run build:web` — static web export (what CI builds)

## Prototype
`prototype/wheel.html` is a standalone, no-build wheel mockup (open in any browser).
