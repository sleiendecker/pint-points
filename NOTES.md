# Dev notes

Working notes for pint-points: decisions made, concepts behind them, and
gotchas. The README stays focused on "how to run it"; this is the "why".

## Architecture decisions

**Single-user MVP, no login.** The `users` table has exactly one row (id 1),
created automatically at startup. Connecting Strava fills in that row, so
the Strava connection *is* the identity. Multi-user means adding
sessions/auth later; everything else (rules, ledger) would just gain a
`user_id` column.

**Points are an append-only ledger.** Earn entries are written when an
activity syncs; redeem entries when you cash in. Balance = sum(earn) −
sum(redeem). Points are captured at earn time, so editing a rule never
rewrites history. Consequence: add rules *before* your first sync, or those
activities earn 0 (the "Recalculate history" button is the escape hatch).

**Rules stack.** Every rule matching an activity's sport type contributes,
so "Run: 1 pt/mile" + "Run: 0.5 pt/100ft" both apply to one run.

**Points start date.** Activities before `users.start_date` never enter the
system (it's the floor of the sync window). Defaults to the moment Strava
was connected; otherwise your entire history floods in as a giant unearned
balance and kills the motivation loop. Changing it triggers a destructive
"reset & re-sync" (wipes activities and earn entries, keeps redemptions,
re-imports).

**Rule suggestions come from local data, not Strava.** Strava's stats
endpoint only covers run/ride/swim, so `/api/sport-stats` rolls up the
local activities table instead. The Rules page shows "Earning nothing
right now: Walk (4)" chips (sports with zero-point activities; click to
prefill the form) and, after adding a rule for such a sport, a recalculate
nudge. The nudge exists because "add rule, then sync" does NOT re-score
already imported activities (sync dedupes them), which trips users up.

**Retroactivity is a deliberate global action, not a per-edit choice.**
Rule edits apply to future syncs only. The "Recalculate history" button in
Settings re-scores all imported activities with current rules, behind a
confirm modal that previews the before/after balance. Per-edit retroactivity
was rejected: once redemptions exist, retroactive cuts can push the balance
negative, which deserves an eyes-open decision, not a checkbox.

**Treats are a curated menu, not freeform.** Redemption used to be a
free-text "what + how many points" form; replaced (June 2026) with a
configurable treats table (name + point cost, max 5, min 1, "🍺 Pint" at
10 pts seeded). Rationale: freeform lets you price the treat at the moment
of craving; a fixed menu keeps the economy honest. Redeeming is
quantity-based with a live total. Costs are always read server-side from
the treats table, never trusted from the client. One ledger entry per
treat line ("2× 🍺 Pint"), copied by value, so editing or deleting a treat
never rewrites history.

**SQLite as a file.** No database server. `apps/api/data/pint-points.db` is
created on first run (gitignored). Tables are created with
`CREATE TABLE IF NOT EXISTS` at startup, which is fine while the schema is
young; if it evolves a lot, drizzle-kit migrations are the grown-up path.

**Vite proxy instead of CORS.** The web app calls `fetch('/api/...')` on
the same origin, and Vite forwards it to the API on :8787 (see
`apps/web/vite.config.ts`). The browser never makes a cross-origin request,
so CORS never comes up.

## Strava integration

OAuth flow (all in `apps/api/src/strava.ts`):
1. Browser hits `/api/strava/connect` and gets redirected to Strava's
   authorize page
2. Strava redirects back to `/api/strava/callback` with a one-time code
3. API exchanges the code for an access token + refresh token, stores both

Access tokens expire every 6 hours; the API silently refreshes using the
refresh token before each sync.

Gotcha: with the `after` param, Strava returns activities **oldest-first**.
The fetch loop pages until a short batch, capped at 30 pages (3000
activities) to stay well inside the 200-req/15-min rate limit. If a sync
ever hits the cap, it's the *newest* activities that get cut off.

### Strava developer program changes (email, June 2026)

- **New Standard Tier developers need a paid Strava subscription** (since
  June 1, 2026). Applies to us. The official Strava MCP alternative is also
  subscriber-only. Free fallback if ever needed: Strava's bulk data export
  (an "import export file" feature could be built).
- Standard Tier self-serve: up to 10 athletes, no review queue. Plenty.
- **June 1, 2027:** API host moves to `https://www.api-v3.strava.com`. It's
  a one-line change, since the base URL is a constant in `strava.ts`.
  Tokens must be sent in headers (already compliant). `oauth/deauthorize`
  retired (unused).
- Club/Segments endpoint deprecations: don't affect us. Intermediary
  platform ban: doesn't affect us (direct integration).

## Stack & UI

- Monorepo: Turborepo + pnpm workspaces. `apps/web`, `apps/api`, and
  `packages/shared` (the type contract between them: change an API
  response shape and both sides break loudly at compile time).
- API: Hono (Express-like, TypeScript-first) on Node.
- UI: **Mantine v8** (replaced Tailwind, June 2026, to keep one styling
  system). Dark mode + yellow primary set via `MantineProvider` in
  `main.tsx`. Style props (`p="md"`, `c="dimmed"`) cover most
  utility-class needs.

## TypeScript notes (things worth knowing as they come up)

- Mantine's `NumberInput` onChange emits `number | string` (empty field =
  `""`), so its state is typed `useState<number | string>` and converted
  with `Number()` on submit. See the comments in `Dashboard.tsx`/`Rules.tsx`.
- `Type 'string | undefined' is not assignable to type 'string'` roughly
  means "you forgot to handle the missing case" and is usually a real bug
  being caught.

## Possible next steps

- Strava webhooks (auto-sync; needs a publicly reachable URL)
- Sync-on-open staleness check (auto-sync when the dashboard loads and the
  last sync is over an hour old)
- Multi-user with real auth
- Import from Strava bulk export (subscription-free path)
- Stats ("47 pints this year"), enabled by per-treat ledger lines
