# 🍺 pint-points

Earn your beer. Connect Strava, set conversion rules (e.g. 1 pt per mile run,
1 pt per hour lifting), and redeem points for your vice of choice.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | React 19 + Vite + Mantine frontend |
| `apps/api` | Hono API on Node: Strava OAuth, sync, rules, points ledger |
| `packages/shared` | Types shared by both |

Data lives in a SQLite file at `apps/api/data/pint-points.db` (gitignored,
created automatically on first run). The points model is an append-only
ledger: earn entries are written when activities sync, redeem entries when
you cash in. Balance = earned − redeemed, so editing a rule never rewrites
history.

## Running it

```sh
pnpm install
pnpm dev          # starts api (:8787) and web (:5173)
```

Want demo data without connecting Strava?

```sh
pnpm --filter api seed
```

## Connecting Strava

1. Create an API app at <https://www.strava.com/settings/api>
   - **Authorization Callback Domain:** `localhost`
2. Copy `apps/api/.env.example` to `apps/api/.env` and fill in
   `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`.
3. Restart the api, open the web app, hit **Connect Strava**, then **Sync Strava**.

Note: rules apply at sync time. Add your earning rules *before* the first
sync, or the synced activities will earn 0 points (Settings has a
"Recalculate history" button if you forget).
