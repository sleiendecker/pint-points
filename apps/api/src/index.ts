import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { MAX_TREATS, SPORT_METRICS } from "@pint-points/shared";
import type {
  Me,
  Metric,
  RecalculatePreview,
  RedeemItem,
  SportStat,
  SportType,
  SyncResult,
} from "@pint-points/shared";
import { db, schema } from "./db/index.js";
import { computePoints } from "./points.js";
import { authorizeUrl, exchangeCode, fetchActivities, stravaConfigured } from "./strava.js";

const app = new Hono().basePath("/api");
const now = () => Math.floor(Date.now() / 1000);
const webUrl = () => process.env.WEB_URL ?? "http://localhost:5173";

const getUser = () => db.select().from(schema.users).where(eq(schema.users.id, 1)).get();

function getBalance(): number {
  const row = db
    .select({
      balance: sql<number>`coalesce(sum(case when ${schema.ledger.type} = 'earn' then ${schema.ledger.points} else -${schema.ledger.points} end), 0)`,
    })
    .from(schema.ledger)
    .get();
  return Math.round((row?.balance ?? 0) * 10) / 10;
}

// ---- profile ----

app.get("/me", (c) => {
  const user = getUser();
  const me: Me = {
    connected: Boolean(user?.refreshToken),
    firstname: user?.firstname ?? null,
    lastname: user?.lastname ?? null,
    profile: user?.profile ?? null,
    lastSyncAt: user?.lastSyncAt ?? null,
    startDate: user?.startDate ?? null,
    balance: getBalance(),
  };
  return c.json(me);
});

// ---- Strava OAuth ----

app.get("/strava/connect", (c) => {
  if (!stravaConfigured()) {
    return c.json(
      { error: "Strava credentials missing. Copy apps/api/.env.example to .env and fill them in." },
      503,
    );
  }
  return c.redirect(authorizeUrl());
});

app.get("/strava/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.redirect(`${webUrl()}/?strava=denied`);
  await exchangeCode(code);
  // Default the points start date to "now" on first connect, so history
  // doesn't flood in as a giant unearned balance.
  db.update(schema.users)
    .set({ startDate: sql`coalesce(${schema.users.startDate}, unixepoch())` })
    .where(eq(schema.users.id, 1))
    .run();
  return c.redirect(`${webUrl()}/?strava=connected`);
});

// ---- sync ----

// Shared by /sync and /resync. Assumes the user is connected.
async function performSync(): Promise<SyncResult> {
  const user = getUser()!;
  // Window floor: never before the points start date. Past that, overlap
  // the last sync by a day so late-uploaded activities aren't missed; the
  // activity primary key dedupes anything we've already stored.
  const after = Math.max(
    user.startDate ?? 0,
    user.lastSyncAt ? user.lastSyncAt - 86400 : 0,
  );
  const fetched = await fetchActivities(after);
  const allRules = db.select().from(schema.rules).all();

  let newActivities = 0;
  let pointsEarned = 0;
  for (const a of fetched) {
    const existing = db
      .select({ id: schema.activities.id })
      .from(schema.activities)
      .where(eq(schema.activities.id, a.id))
      .get();
    if (existing) continue;

    const points = computePoints(
      {
        sportType: a.sport_type,
        distanceMeters: a.distance,
        movingTimeSeconds: a.moving_time,
        elevationGainMeters: a.total_elevation_gain,
      },
      allRules,
    );
    db.insert(schema.activities)
      .values({
        id: a.id,
        name: a.name,
        sportType: a.sport_type,
        distanceMeters: a.distance,
        movingTimeSeconds: a.moving_time,
        elevationGainMeters: a.total_elevation_gain,
        startDate: a.start_date,
        pointsEarned: points,
        syncedAt: now(),
      })
      .run();
    if (points > 0) {
      db.insert(schema.ledger)
        .values({
          type: "earn",
          points,
          description: a.name,
          activityId: a.id,
          // Date the entry to the activity, not the sync, so a batch sync
          // doesn't show a wall of same-day history entries
          createdAt: Math.floor(Date.parse(a.start_date) / 1000),
        })
        .run();
    }
    newActivities++;
    pointsEarned += points;
  }

  db.update(schema.users).set({ lastSyncAt: now() }).where(eq(schema.users.id, 1)).run();
  return { newActivities, pointsEarned: Math.round(pointsEarned * 10) / 10 };
}

app.post("/sync", async (c) => {
  if (!getUser()?.refreshToken) return c.json({ error: "Strava is not connected" }, 400);
  return c.json(await performSync());
});

// Change the points start date: wipe imported activities and their earn
// entries (redemptions are kept; those beers were drunk), then re-import
// from the new date.
app.post("/resync", async (c) => {
  const body = await c.req.json<{ startDate: number }>().catch(() => null);
  const startDate = Number(body?.startDate);
  if (!(startDate > 0)) return c.json({ error: "Invalid start date" }, 400);
  if (!getUser()?.refreshToken) return c.json({ error: "Strava is not connected" }, 400);

  db.update(schema.users)
    .set({ startDate, lastSyncAt: null })
    .where(eq(schema.users.id, 1))
    .run();
  db.delete(schema.activities).run();
  db.delete(schema.ledger).where(eq(schema.ledger.type, "earn")).run();
  return c.json(await performSync());
});

// ---- recalculate (re-score stored activities with current rules) ----

function recalculatedEntries() {
  const allRules = db.select().from(schema.rules).all();
  return db
    .select()
    .from(schema.activities)
    .all()
    .map((activity) => ({ activity, points: computePoints(activity, allRules) }));
}

app.get("/recalculate/preview", (c) => {
  const newEarned = recalculatedEntries().reduce((sum, e) => sum + e.points, 0);
  const redeemed =
    db
      .select({ s: sql<number>`coalesce(sum(${schema.ledger.points}), 0)` })
      .from(schema.ledger)
      .where(eq(schema.ledger.type, "redeem"))
      .get()?.s ?? 0;
  const preview: RecalculatePreview = {
    currentBalance: getBalance(),
    newBalance: Math.round((newEarned - redeemed) * 10) / 10,
  };
  return c.json(preview);
});

app.post("/recalculate", (c) => {
  for (const { activity, points } of recalculatedEntries()) {
    db.update(schema.activities)
      .set({ pointsEarned: points })
      .where(eq(schema.activities.id, activity.id))
      .run();
    const entry = db
      .select()
      .from(schema.ledger)
      .where(eq(schema.ledger.activityId, activity.id))
      .get();
    if (entry && points > 0) {
      db.update(schema.ledger).set({ points }).where(eq(schema.ledger.id, entry.id)).run();
    } else if (entry && points === 0) {
      db.delete(schema.ledger).where(eq(schema.ledger.id, entry.id)).run();
    } else if (!entry && points > 0) {
      db.insert(schema.ledger)
        .values({
          type: "earn",
          points,
          description: activity.name,
          activityId: activity.id,
          // Date the entry to the activity so history stays in order
          createdAt: Math.floor(Date.parse(activity.startDate) / 1000),
        })
        .run();
    }
  }
  return c.json({ balance: getBalance() });
});

// ---- rules ----

app.get("/rules", (c) => {
  return c.json(db.select().from(schema.rules).orderBy(schema.rules.sportType).all());
});

interface RuleInput {
  sportType: string;
  metric: string;
  pointsPerUnit: number;
}

function validRule(body: RuleInput): boolean {
  // SPORT_METRICS doubles as the sport-type whitelist and the
  // which-metrics-make-sense check (no "per mile" weightlifting)
  const allowedMetrics = SPORT_METRICS[body.sportType as SportType] as
    | readonly Metric[]
    | undefined;
  return Boolean(allowedMetrics?.includes(body.metric as Metric)) && body.pointsPerUnit > 0;
}

app.post("/rules", async (c) => {
  const body = await c.req.json<RuleInput>();
  if (!validRule(body)) return c.json({ error: "Invalid rule" }, 400);
  const rule = db
    .insert(schema.rules)
    .values({
      sportType: body.sportType,
      metric: body.metric,
      pointsPerUnit: body.pointsPerUnit,
      createdAt: now(),
    })
    .returning()
    .get();
  return c.json(rule, 201);
});

// Edits apply to future syncs only; past ledger entries keep the points
// they were earned with.
app.patch("/rules/:id", async (c) => {
  const body = await c.req.json<RuleInput>();
  if (!validRule(body)) return c.json({ error: "Invalid rule" }, 400);
  const rule = db
    .update(schema.rules)
    .set({ sportType: body.sportType, metric: body.metric, pointsPerUnit: body.pointsPerUnit })
    .where(eq(schema.rules.id, Number(c.req.param("id"))))
    .returning()
    .get();
  if (!rule) return c.json({ error: "Rule not found" }, 404);
  return c.json(rule);
});

app.delete("/rules/:id", (c) => {
  db.delete(schema.rules)
    .where(eq(schema.rules.id, Number(c.req.param("id"))))
    .run();
  return c.body(null, 204);
});

// ---- activities & ledger ----

// Sorting/pagination happen client-side, so these return everything,
// which is fine at single-user scale (a few thousand rows, tops).
app.get("/activities", (c) => {
  return c.json(
    db.select().from(schema.activities).orderBy(desc(schema.activities.startDate)).all(),
  );
});

// Per-sport rollup of what's imported. Powers "you do this but it earns
// nothing" rule suggestions. Local data only; Strava's stats endpoint
// covers just run/ride/swim.
app.get("/sport-stats", (c) => {
  const stats: SportStat[] = db
    .select({
      sportType: schema.activities.sportType,
      count: sql<number>`count(*)`,
      zeroPoints: sql<number>`sum(case when ${schema.activities.pointsEarned} = 0 then 1 else 0 end)`,
    })
    .from(schema.activities)
    .groupBy(schema.activities.sportType)
    .orderBy(desc(sql`count(*)`))
    .all();
  return c.json(stats);
});

app.get("/ledger", (c) => {
  return c.json(
    db
      .select()
      .from(schema.ledger)
      .orderBy(desc(schema.ledger.createdAt), desc(schema.ledger.id))
      .all(),
  );
});

// Redeem a basket of treats. Costs come from the treats table, never the
// client. One ledger entry per treat line keeps history readable.
app.post("/redeem", async (c) => {
  const body = await c.req.json<{ items: RedeemItem[] }>().catch(() => null);
  const items = (body?.items ?? []).filter((i) => Number.isInteger(i.quantity) && i.quantity > 0);
  if (!items.length) return c.json({ error: "Nothing to redeem" }, 400);

  const lines: Array<{ points: number; description: string }> = [];
  for (const item of items) {
    const treat = db.select().from(schema.treats).where(eq(schema.treats.id, item.treatId)).get();
    if (!treat) return c.json({ error: "Unknown treat" }, 400);
    lines.push({
      points: Math.round(treat.pointCost * item.quantity * 10) / 10,
      description: `${item.quantity}× ${treat.name}`,
    });
  }

  const total = Math.round(lines.reduce((sum, l) => sum + l.points, 0) * 10) / 10;
  if (total > getBalance()) {
    return c.json({ error: "Not enough points. Go earn it first 🏃" }, 400);
  }

  for (const line of lines) {
    db.insert(schema.ledger)
      .values({ type: "redeem", points: line.points, description: line.description, createdAt: now() })
      .run();
  }
  return c.json({ total, balance: getBalance() }, 201);
});

// ---- treats ----

app.get("/treats", (c) => {
  return c.json(db.select().from(schema.treats).orderBy(schema.treats.id).all());
});

const validTreat = (body: { name?: string; pointCost?: number }) =>
  Boolean(body.name?.trim()) && Number(body.pointCost) > 0;

app.post("/treats", async (c) => {
  const body = await c.req.json<{ name: string; pointCost: number }>();
  if (!validTreat(body)) return c.json({ error: "Invalid treat" }, 400);
  const count = db.select().from(schema.treats).all().length;
  if (count >= MAX_TREATS) {
    return c.json({ error: `Keep the menu curated: max ${MAX_TREATS} treats` }, 400);
  }
  const treat = db
    .insert(schema.treats)
    .values({ name: body.name.trim(), pointCost: body.pointCost, createdAt: now() })
    .returning()
    .get();
  return c.json(treat, 201);
});

app.patch("/treats/:id", async (c) => {
  const body = await c.req.json<{ name: string; pointCost: number }>();
  if (!validTreat(body)) return c.json({ error: "Invalid treat" }, 400);
  const treat = db
    .update(schema.treats)
    .set({ name: body.name.trim(), pointCost: body.pointCost })
    .where(eq(schema.treats.id, Number(c.req.param("id"))))
    .returning()
    .get();
  if (!treat) return c.json({ error: "Treat not found" }, 404);
  return c.json(treat);
});

app.delete("/treats/:id", (c) => {
  const count = db.select().from(schema.treats).all().length;
  if (count <= 1) return c.json({ error: "Keep at least one treat. You earned it!" }, 400);
  db.delete(schema.treats)
    .where(eq(schema.treats.id, Number(c.req.param("id"))))
    .run();
  return c.body(null, 204);
});

const port = 8787;
serve({ fetch: app.fetch, port });
console.log(`pint-points api listening on http://localhost:${port}`);
if (!stravaConfigured()) {
  console.log("⚠ Strava credentials not set. Copy .env.example to .env to enable connect/sync.");
}
